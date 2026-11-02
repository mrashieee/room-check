/*
 * Room Check smoke test
 * Copyright (c) 2026 Muhammad Rashid K
 * SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "tests", "fixtures");
const password = "test-password-123";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/microsoft-edge",
].filter(Boolean);

function findChrome() {
  const found = chromeCandidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      "No Chromium browser found. Set CHROME_PATH to a Chromium/Chrome executable.",
    );
  }
  return found;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer(port, dataDir) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      UPDATE_CHECK: "off",
      PUBLIC_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let setupCode = "";
  const base = `http://127.0.0.1:${port}`;

  const append = (chunk) => {
    output += chunk.toString();
    const match = output.match(/FIRST-RUN SETUP CODE:\s*([A-Z0-9-]+)/);
    if (match) setupCode = match[1];
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (setupCode) {
      try {
        const response = await fetch(base + "/healthz");
        if (response.ok) return { child, base, setupCode, getOutput: () => output };
      } catch {
        // Server is still starting.
      }
    }
    if (child.exitCode !== null) {
      throw new Error(`Server exited early.\n${output}`);
    }
    await wait(150);
  }
  throw new Error(`Server did not start.\n${output}`);
}

async function waitVisible(locator, timeout = 20_000) {
  await locator.waitFor({ state: "visible", timeout });
}

async function text(locator) {
  return (await locator.textContent())?.trim() || "";
}

async function stopServer(server) {
  if (!server?.child || server.child.exitCode !== null) return;
  server.child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    server.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const port = await findFreePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "room-check-smoke-"));
  const server = await startServer(port, dataDir);
  const browser = await chromium.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const hostPage = await hostContext.newPage();
    await hostPage.goto(server.base + "/", { waitUntil: "domcontentloaded" });

    console.log("1/13 landing and removed routes");
    assert.equal(await text(hostPage.locator("h1").first()), "Run the room.");
    assert.deepEqual(await hostPage.locator(".landing-option strong").allTextContents(), [
      "Presentation",
      "Poll, survey or hands",
    ]);
    assert.equal(await hostPage.locator(".landing-option-index").count(), 0);
    assert.equal(await text(hostPage.locator(".brand-tag").first()), "Home");
    for (const route of ["/online", "/live"]) {
      const response = await hostPage.goto(server.base + route, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 404, `${route} should be gone`);
    }

    console.log("2/13 host setup");
    await hostPage.goto(server.base + "/host", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#auth-setup-form"));
    await hostPage.fill("#setup-code", server.setupCode);
    await hostPage.fill("#new-password", password);
    await hostPage.fill("#confirm-password", password);
    await hostPage.click("#setup-submit");
    await waitVisible(hostPage.locator("#host-app"), 20_000);

    console.log("3/13 projector setup and deck upload");
    await hostPage.goto(server.base + "/present", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#present-setup"));
    await hostPage.setInputFiles("#present-files", [
      path.join(fixtures, "slide-1.png"),
      path.join(fixtures, "slide-2.png"),
      path.join(fixtures, "deck.pdf"),
    ]);
    await hostPage.waitForFunction(
      () => document.querySelectorAll("#slide-list .slide-row").length >= 4,
      null,
      { timeout: 60_000 },
    );
    assert.equal(await hostPage.locator("#slide-list .slide-row").count(), 4);
    await hostPage.fill("#present-title", "Smoke Test Deck");
    assert.match(await text(hostPage.locator("#present-audience-url")), /:\d+\/join$/);
    assert.equal(await text(hostPage.locator("#present-audience-mode")), "LAN");
    await hostPage.click("#present-start");
    await waitVisible(hostPage.locator("#present-display"), 20_000);

    console.log("4/13 controller pairing and slide access");
    const hostState = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/state", { credentials: "same-origin" });
      return response.json();
    });
    const token = hostState.presentationToken;
    assert.ok(token && token.length >= 24, "controller token missing");
    assert.equal(hostState.state.presentation.slides.length, 4);
    const publicState = await (await fetch(server.base + "/api/state")).json();
    assert.equal(publicState.state.presentation.slides, undefined, "public state must not expose slides");
    assert.equal(publicState.state.presentation.slideCount, 4);
    const publicSlidePath = `/api/presentation/slide/${hostState.state.presentation.slides[0].id}`;
    const publicSlideResponse = await fetch(server.base + publicSlidePath);
    assert.equal(publicSlideResponse.status, 401, "slides must require host/controller auth");
    const oldPresentationState = await fetch(server.base + "/api/presentation/state");
    assert.equal(oldPresentationState.status, 404, "public presentation state route should be removed");
    const controllerStateResponse = await fetch(server.base + "/api/controller/state", {
      headers: { "X-Controller-Token": token },
    });
    assert.equal(controllerStateResponse.status, 200);
    const controllerState = await controllerStateResponse.json();
    assert.equal(controllerState.state.presentation.slides.length, 4);
    const controllerSlide = controllerState.state.presentation.slides[0];
    assert.match(controllerSlide.src, /\?token=/);
    const controllerSlideResponse = await fetch(server.base + controllerSlide.src);
    assert.equal(controllerSlideResponse.status, 200);
    const hostSlideResponse = await hostPage.evaluate(async (src) => {
      const response = await fetch(src, { credentials: "same-origin" });
      return response.status;
    }, hostState.state.presentation.slides[0].src);
    assert.equal(hostSlideResponse, 200);
    const controllerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const controllerPage = await controllerContext.newPage();
    await controllerPage.goto(
      `${server.base}/controller?token=${encodeURIComponent(token)}`,
      { waitUntil: "domcontentloaded" },
    );
    await waitVisible(controllerPage.locator("#controller-live"));
    assert.equal(await controllerPage.locator('a[href="/present"]').count(), 0);
    assert.match(await text(controllerPage.locator("#controller-counter")), /1 \/ 4/);
    await controllerPage.click("#controller-next");
    await controllerPage.waitForFunction(() =>
      document.querySelector("#controller-counter")?.textContent?.includes("2 / 4"),
    );

    console.log("5/13 audience join");
    const audienceContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const audiencePage = await audienceContext.newPage();
    await audiencePage.goto(server.base + "/join", { waitUntil: "domcontentloaded" });
    await waitVisible(audiencePage.locator("#screen-presentation"));
    assert.match(await text(audiencePage.locator("#presentation-title")), /Smoke Test Deck/);

    console.log("6/13 quick poll");
    await controllerPage.click('[data-tab="poll"]');
    await waitVisible(controllerPage.locator("#controller-poll-form"));
    await controllerPage.fill("#controller-poll-question", "Which slide is better?");
    await controllerPage.locator("#controller-poll-options input").nth(0).fill("First");
    await controllerPage.locator("#controller-poll-options input").nth(1).fill("Second");
    await controllerPage.click("#controller-add-option");
    await controllerPage.locator("#controller-poll-options input").nth(2).fill("Third");
    await controllerPage.selectOption("#controller-poll-duration", "0");
    await controllerPage.click("#controller-poll-start");
    await waitVisible(audiencePage.locator("#screen-vote"));
    await audiencePage.locator("#vote-options .vote-option").nth(1).click();
    await audiencePage.click("#vote-submit");
    await waitVisible(audiencePage.locator("#screen-voted"));
    await controllerPage.waitForFunction(
      () => /1\s+vote/i.test(document.querySelector("#controller-interaction-count")?.textContent || ""),
      null,
      { timeout: 15_000 },
    );
    await controllerPage.click("#controller-interaction-action");
    await waitVisible(audiencePage.locator("#screen-results"));
    await controllerPage.click("#controller-interaction-back");
    await waitVisible(audiencePage.locator("#screen-presentation"));

    console.log("7/13 Live Hands");
    await controllerPage.click('[data-tab="hands"]');
    await waitVisible(controllerPage.locator("#controller-hands-form"));
    await controllerPage.fill("#controller-hands-question", "Who is with us?");
    await controllerPage.click("#controller-hands-start");
    await waitVisible(audiencePage.locator("#screen-hands"));
    await audiencePage.click("#hands-toggle");
    await controllerPage.waitForFunction(
      () => /1\s+hand/i.test(document.querySelector("#controller-interaction-count")?.textContent || ""),
      null,
      { timeout: 15_000 },
    );
    await controllerPage.click("#controller-interaction-action");
    await controllerPage.click("#controller-interaction-back");
    await waitVisible(audiencePage.locator("#screen-presentation"));

    console.log("8/13 survey");
    const surveyStart = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/survey/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Smoke Survey",
          durationSec: 0,
          questions: [
            { question: "First question?", options: ["A", "B"], durationSec: 0, spinOnTie: false },
            { question: "Second question?", options: ["C", "D"], durationSec: 0, spinOnTie: false },
          ],
        }),
      });
      return response.status;
    });
    assert.equal(surveyStart, 200);
    await waitVisible(audiencePage.locator("#screen-survey"));
    await audiencePage.locator("#survey-options .vote-option").nth(0).click();
    await audiencePage.click("#survey-next");
    await audiencePage.waitForFunction(() =>
      document.querySelector("#survey-question")?.textContent?.includes("Second question?"),
    );
    await audiencePage.locator("#survey-options .vote-option").nth(1).click();
    await audiencePage.click("#survey-next");
    await waitVisible(audiencePage.locator("#screen-survey-done"));
    const surveyEnd = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return response.status;
    });
    assert.equal(surveyEnd, 200);
    await waitVisible(audiencePage.locator("#screen-survey-results"));

    console.log("9/13 share card");
    await hostPage.goto(server.base + "/share", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#share-ready"));
    assert.match(await text(hostPage.locator("#share-link")), /\/join$/);
    const downloadPromise = hostPage.waitForEvent("download", { timeout: 20_000 });
    await hostPage.click("#share-download");
    const download = await downloadPromise;
    const downloadPath = path.join(dataDir, "share-card.png");
    await download.saveAs(downloadPath);
    const png = fs.readFileSync(downloadPath);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 1920);
    assert.equal(png.readUInt32BE(20), 1080);

    console.log("10/13 end session from controller");
    await controllerPage.goto(
      `${server.base}/controller?token=${encodeURIComponent(token)}`,
      { waitUntil: "domcontentloaded" },
    );
    await waitVisible(controllerPage.locator("#controller-end-session"));
    controllerPage.on("dialog", (dialog) => dialog.accept());
    await controllerPage.click("#controller-end-session");
    await waitVisible(audiencePage.locator("#screen-thanks"));
    await controllerPage.waitForFunction(
      () => document.querySelector("#controller-state")?.textContent === "Ended",
    );

    console.log("11/13 host ended screen");
    await hostPage.goto(server.base + "/host", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#host-app"));
    await waitVisible(hostPage.locator("#ended-stage"));

    console.log("12/13 presenter and host header links");
    await hostPage.goto(server.base + "/present", { waitUntil: "domcontentloaded" });
    assert.equal(await hostPage.locator('#present-end-session').count(), 1);
    assert.equal(await hostPage.locator('.text-button[href="/share"]').count() >= 1, true);
    assert.equal(await hostPage.locator('.text-button[href="/"]').count() >= 1, true);

    console.log("13/13 done");
    console.log("SMOKE OK");
  } finally {
    await browser.close().catch(() => {});
    await stopServer(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("SMOKE FAILED");
  console.error(error);
  process.exitCode = 1;
});
