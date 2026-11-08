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
  const pageErrors = [];
  const pages = [];
  const trackPage = (page, name) => {
    pages.push({ page, name });
    page.on("pageerror", (error) => pageErrors.push(`${name}: ${error.message}`));
  };

  async function saveArtifacts(cause) {
    const dir = process.env.SMOKE_ARTIFACTS;
    if (!dir) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "failure.txt"),
        `${new Date().toISOString()}\n${cause?.stack || cause}\n\nPage errors:\n${pageErrors.join("\n")}\n`,
      );
      try {
        fs.writeFileSync(path.join(dir, "server.log"), server.getOutput());
      } catch {
        // Server output unavailable.
      }
      for (const { page, name } of pages) {
        try {
          if (!page.isClosed()) {
            await page.screenshot({ path: path.join(dir, `${name}.png`) });
          }
        } catch {
          // Page already gone; move on.
        }
      }
      console.error(`Smoke artifacts saved to ${dir}`);
    } catch (error) {
      console.error(`Could not save smoke artifacts: ${error.message}`);
    }
  }

  try {
    const hostContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const hostPage = await hostContext.newPage();
    trackPage(hostPage, "host");

    console.log("1/15 protected landing");
    await hostPage.goto(server.base + "/", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#auth-setup-form"));
    assert.match(hostPage.url(), /\/interactions\?next=\/$/);

    console.log("2/15 host setup and landing");
    await hostPage.fill("#setup-code", server.setupCode);
    await hostPage.fill("#new-password", password);
    await hostPage.fill("#confirm-password", password);
    await hostPage.click("#setup-submit");
    await hostPage.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });
    assert.equal(await text(hostPage.locator("h1").first()), "Run the room.");
    assert.deepEqual(await hostPage.locator(".landing-option strong").allTextContents(), [
      "Presentation",
      "Poll, survey or hands",
    ]);
    assert.equal(await hostPage.locator(".landing-option-index").count(), 0);
    assert.equal(await text(hostPage.locator(".brand-tag").first()), "Home");
    assert.equal(await hostPage.locator(".landing-header .brand").getAttribute("href"), "/");
    assert.equal(await hostPage.locator("#landing-fullscreen").count(), 1);
    const fullscreenAllowed = await hostPage.evaluate(() => document.fullscreenEnabled);
    assert.equal(await hostPage.locator("#customise-button").count(), 1);
    assert.equal(await hostPage.locator("#landing-end-session").isDisabled(), true);
    await hostPage.click("#customise-button");
    await waitVisible(hostPage.locator("#customizer-overlay"));
    await hostPage.waitForFunction(() => document.querySelector(".landing-main")?.inert === true);
    assert.equal(new URL(hostPage.url()).pathname, "/");
    await hostPage.locator(".palette-card").first().click();
    await hostPage.click("#theme-save");
    await hostPage.waitForFunction(() => document.querySelector("#customizer-overlay")?.hidden);
    await hostPage.waitForFunction(() => document.querySelector(".landing-main")?.inert === false);
    if (fullscreenAllowed) {
      await hostPage.click("#landing-fullscreen");
      await hostPage.waitForFunction(() => Boolean(document.fullscreenElement));
      await hostPage.click("#landing-fullscreen");
      await hostPage.waitForFunction(() => !document.fullscreenElement);
    }
    const hostThanksResponse = await hostPage.goto(server.base + "/thanks-host", { waitUntil: "domcontentloaded" });
    assert.equal(hostThanksResponse.status(), 200);
    assert.equal(await hostPage.locator("#thanks-start").count(), 1);
    await hostPage.goto(server.base + "/", { waitUntil: "domcontentloaded" });
    for (const route of ["/online", "/live"]) {
      const response = await hostPage.goto(server.base + route, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 404, `${route} should be gone`);
    }
    await hostPage.goto(server.base + "/updates", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#update-status"));
    assert.equal(await hostPage.locator(".site-header .brand").getAttribute("href"), "/");
    await hostPage.click("#check-again");
    await waitVisible(hostPage.locator("#update-status"));
    await hostPage.goto(server.base + "/interactions", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#host-app"));
    assert.equal(await hostPage.locator("#allow-custom").isChecked(), true);
    if (fullscreenAllowed) {
      await hostPage.click("#fullscreen-button");
      await hostPage.waitForFunction(() => Boolean(document.fullscreenElement));
      await hostPage.click("#fullscreen-button");
      await hostPage.waitForFunction(() => !document.fullscreenElement);
    }
    await hostPage.click("#customise-button");
    await waitVisible(hostPage.locator("#customizer-overlay"));
    await hostPage.click("#customizer-close");
    await hostPage.waitForFunction(() => document.querySelector("#customizer-overlay")?.hidden);
    const exportPromise = hostPage.waitForEvent("download", { timeout: 20_000 });
    await hostPage.check("#multi-question-toggle");
    await waitVisible(hostPage.locator("#session-builder"));
    await hostPage.click("#export-questions");
    const exportDownload = await exportPromise;
    const exportPath = path.join(dataDir, "questions-export.json");
    await exportDownload.saveAs(exportPath);
    const exported = JSON.parse(fs.readFileSync(exportPath, "utf8"));
    assert.ok(exported.title, "export should include a title");
    assert.ok(Array.isArray(exported.questions) && exported.questions.length >= 1, "export should include questions");
    assert.ok(exported.questions[0].question && Array.isArray(exported.questions[0].options), "export shape should match import");
    await hostPage.setInputFiles("#import-questions-input", exportPath);
    await hostPage.waitForFunction(
      (count) => document.querySelector("#session-count")?.textContent?.includes(String(count)),
      exported.questions.length,
      { timeout: 10_000 },
    );

    console.log("3/15 projector setup and deck upload");
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
    if (fullscreenAllowed) {
      await hostPage.click("#present-fullscreen");
      await hostPage.waitForFunction(() => Boolean(document.fullscreenElement));
      await hostPage.click("#present-fullscreen");
      await hostPage.waitForFunction(() => !document.fullscreenElement);
    }
    await hostPage.click("#present-next");
    await hostPage.waitForFunction(() => document.querySelector("#present-display-label")?.textContent?.includes("2 / 4"));
    await hostPage.click("#present-prev");
    await hostPage.waitForFunction(() => document.querySelector("#present-display-label")?.textContent?.includes("1 / 4"));
    await hostPage.click("#present-rotate");
    await hostPage.click("#present-fit");
    await hostPage.waitForFunction(() => document.querySelector("#present-fit")?.textContent?.includes("Fit width"));
    await hostPage.click("#present-fit");
    await hostPage.waitForFunction(() => document.querySelector("#present-fit")?.textContent?.includes("Fit page"));
    await hostPage.click("#present-back");
    await waitVisible(hostPage.locator("#present-setup"));
    await waitVisible(hostPage.locator("#present-resume"));
    await waitVisible(hostPage.locator("#present-stop-presentation"));
    assert.equal(await hostPage.locator("#present-host-controls a").getAttribute("href"), "/interactions");
    await hostPage.click("#present-resume");
    await waitVisible(hostPage.locator("#present-display"));
    assert.equal(await hostPage.locator("#present-end-presentation").isHidden(), false);
    assert.equal(await hostPage.locator("#present-end-session").isHidden(), false);
    assert.equal(await text(hostPage.locator("#present-end-session")), "End session");
    const headerPoll = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/open", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "poll", question: "Header check?", options: ["Yes", "No"] }),
      });
      return response.status;
    });
    assert.equal(headerPoll, 200);
    await hostPage.click("#present-back");
    await waitVisible(hostPage.locator("#present-setup"));
    await hostPage.reload({ waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#present-setup"));
    assert.equal(await hostPage.locator("#present-end-session").isHidden(), false);
    assert.equal(await text(hostPage.locator("#present-end-session")), "End interaction");
    hostPage.once("dialog", (dialog) => dialog.accept());
    await hostPage.click("#present-end-session");
    await hostPage.waitForFunction(
      () => document.querySelector("#present-end-session")?.textContent === "End session",
      null,
      { timeout: 10_000 },
    );
    await hostPage.reload({ waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#present-setup"));
    assert.equal(await hostPage.locator("#present-end-session").isHidden(), false);
    assert.equal(await text(hostPage.locator("#present-end-session")), "End session");
    await hostPage.click("#present-resume");
    await waitVisible(hostPage.locator("#present-display"));
    const homePage = await hostContext.newPage();
    trackPage(homePage, "home");
    await homePage.goto(server.base + "/", { waitUntil: "domcontentloaded" });
    await homePage.waitForFunction(() => !document.querySelector("#landing-end-session")?.disabled, null, { timeout: 10_000 });
    assert.equal(await homePage.locator("#landing-end-session").isDisabled(), false);
    await homePage.close();
    const projectorPage = await hostContext.newPage();
    trackPage(projectorPage, "projector");
    await projectorPage.goto(server.base + "/present", { waitUntil: "domcontentloaded" });
    await waitVisible(projectorPage.locator("#present-setup"));
    await waitVisible(projectorPage.locator("#present-resume"));
    await projectorPage.click("#present-resume");
    await waitVisible(projectorPage.locator("#present-display"));

    console.log("4/15 controller pairing and slide access");
    const hostState = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/state", { credentials: "same-origin" });
      return response.json();
    });
    let token = hostState.presentationToken;
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
    trackPage(controllerPage, "controller");
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
    await controllerPage.click("#controller-prev");
    await controllerPage.waitForFunction(() =>
      document.querySelector("#controller-counter")?.textContent?.includes("1 / 4"),
    );
    await controllerPage.click("#controller-fit-page");
    await controllerPage.waitForFunction(() =>
      document.querySelector("#controller-fit-page")?.classList.contains("is-active"),
    );
    await controllerPage.click("#controller-fit-width");
    await controllerPage.click("#controller-rotate");
    await controllerPage.locator(".controller-slide-button").nth(2).click();
    await controllerPage.waitForFunction(() =>
      document.querySelector("#controller-counter")?.textContent?.includes("3 / 4"),
    );
    await controllerPage.locator(".controller-slide-button").nth(0).click();
    await controllerPage.waitForFunction(() =>
      document.querySelector("#controller-counter")?.textContent?.includes("1 / 4"),
    );
    const previousToken = token;
    const rotatedToken = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/presentation/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return (await response.json()).token;
    });
    assert.notEqual(rotatedToken, token);
    token = rotatedToken;
    const staleTokenResponse = await fetch(server.base + "/api/controller/state", {
      headers: { "X-Controller-Token": previousToken },
    });
    assert.equal(staleTokenResponse.status, 401);
    await controllerPage.goto(
      `${server.base}/controller?token=${encodeURIComponent(token)}`,
      { waitUntil: "domcontentloaded" },
    );
    await waitVisible(controllerPage.locator("#controller-live"));
    const passwordControllerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const passwordController = await passwordControllerContext.newPage();
    trackPage(passwordController, "password-controller");
    await passwordController.goto(server.base + "/controller", { waitUntil: "domcontentloaded" });
    await waitVisible(passwordController.locator("#controller-login"));
    await passwordController.fill("#controller-password", password);
    await passwordController.click("#controller-login-submit");
    await waitVisible(passwordController.locator("#controller-live"));
    await passwordControllerContext.close();

    console.log("5/15 audience join");
    const audienceContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const audiencePage = await audienceContext.newPage();
    trackPage(audiencePage, "audience");
    await audiencePage.goto(server.base + "/join", { waitUntil: "domcontentloaded" });
    await waitVisible(audiencePage.locator("#screen-presentation"));
    assert.match(await text(audiencePage.locator("#presentation-title")), /Smoke Test Deck/);

    console.log("6/15 quick poll");
    await controllerPage.click('[data-tab="poll"]');
    await waitVisible(controllerPage.locator("#controller-poll-form"));
    await controllerPage.fill("#controller-poll-question", "Which slide is better?");
    await controllerPage.locator("#controller-poll-options input").nth(0).fill("First");
    await controllerPage.locator("#controller-poll-options input").nth(1).fill("Second");
    await controllerPage.click("#controller-add-option");
    await controllerPage.locator("#controller-poll-options input").nth(2).fill("Third");
    await controllerPage.locator("#controller-poll-options .controller-option-remove").nth(2).click();
    assert.equal(await controllerPage.locator("#controller-poll-options input").count(), 2);
    await controllerPage.click("#controller-add-option");
    await controllerPage.locator("#controller-poll-options input").nth(2).fill("Third");
    await controllerPage.selectOption("#controller-poll-duration", "0");
    await controllerPage.click("#controller-poll-start");
    await waitVisible(audiencePage.locator("#screen-vote"));
    await audiencePage.locator("#vote-options .vote-option").nth(1).click();
    await audiencePage.click("#vote-submit");
    await waitVisible(audiencePage.locator("#screen-voted"));
    await audiencePage.click("#change-vote-button");
    await waitVisible(audiencePage.locator("#screen-vote"));
    await audiencePage.fill("#vote-write-in-input", "Audience write-in");
    await audiencePage.click("#vote-write-in-submit");
    await waitVisible(audiencePage.locator("#screen-voted"));
    await audiencePage.click("#change-vote-button");
    await waitVisible(audiencePage.locator("#screen-vote"));
    await audiencePage.locator("#vote-options .vote-option").nth(0).click();
    await audiencePage.click("#vote-submit");
    await waitVisible(audiencePage.locator("#screen-voted"));
    await controllerPage.waitForFunction(
      () => /1\s+vote/i.test(document.querySelector("#controller-interaction-count")?.textContent || ""),
      null,
      { timeout: 15_000 },
    );
    await controllerPage.click("#controller-interaction-action");
    await waitVisible(audiencePage.locator("#screen-results"));
    controllerPage.once("dialog", (dialog) => dialog.accept());
    await controllerPage.click("#controller-interaction-back");
    await waitVisible(audiencePage.locator("#screen-presentation"));

    console.log("7/15 Live Hands");
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
    controllerPage.once("dialog", (dialog) => dialog.accept());
    await controllerPage.click("#controller-interaction-back");
    await waitVisible(audiencePage.locator("#screen-presentation"));

    console.log("8/15 survey");
    const surveyStart = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/survey/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Smoke Survey",
          durationSec: 0,
          allowCustom: false,
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
    assert.equal(await audiencePage.locator("#survey-write-in").isHidden(), true);
    await audiencePage.locator("#survey-options .vote-option").nth(0).click();
    await audiencePage.click("#survey-next");
    await audiencePage.waitForFunction(() =>
      document.querySelector("#survey-question")?.textContent?.includes("Second question?"),
    );
    await audiencePage.click("#survey-back");
    await audiencePage.waitForFunction(() =>
      document.querySelector("#survey-question")?.textContent?.includes("First question?"),
    );
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

    console.log("9/15 share card");
    await hostPage.goto(server.base + "/share", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#share-ready"));
    assert.match(await text(hostPage.locator("#share-link")), /\/join$/);
    await hostPage.click("#share-copy");
    await hostPage.waitForFunction(() => document.querySelector("#share-copy")?.getAttribute("aria-label") === "Audience link copied");
    const copiedLink = await hostPage.evaluate(() => navigator.clipboard.readText());
    assert.match(copiedLink, /\/join$/);
    const downloadPromise = hostPage.waitForEvent("download", { timeout: 20_000 });
    await hostPage.click("#share-download");
    const download = await downloadPromise;
    const downloadPath = path.join(dataDir, "share-card.png");
    await download.saveAs(downloadPath);
    const png = fs.readFileSync(downloadPath);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 1920);
    assert.equal(png.readUInt32BE(20), 1080);

    console.log("10/15 end session from controller");
    await controllerPage.goto(
      `${server.base}/controller?token=${encodeURIComponent(token)}`,
      { waitUntil: "domcontentloaded" },
    );
    await waitVisible(controllerPage.locator("#controller-end-session"));
    controllerPage.on("dialog", (dialog) => dialog.accept());
    await controllerPage.click("#controller-end-session");
    await audiencePage.waitForURL((url) => url.pathname === "/thanks", { timeout: 15_000 });
    await waitVisible(audiencePage.locator(".ended-copy h1"));
    assert.equal(await audiencePage.locator("#thanks-start").count(), 0);
    assert.equal(await audiencePage.locator('.site-header a[href="/"]').count(), 0);
    await projectorPage.waitForURL((url) => url.pathname === "/thanks-host", { timeout: 15_000 });
    await waitVisible(projectorPage.locator(".ended-copy h1"));
    await controllerPage.waitForURL((url) => url.pathname === "/thanks-host", { timeout: 15_000 });
    await waitVisible(controllerPage.locator(".ended-copy h1"));
    assert.match(await text(controllerPage.locator(".thanks-support-title")), /Give Room Check a star/);
    assert.equal(await controllerPage.locator(".ended-star .github-mark").count(), 1);
    assert.match(await controllerPage.locator("#thanks-qr").getAttribute("src"), /\/api\/qr\?data=/);

    console.log("11/15 host sees ended session");
    await hostPage.goto(server.base + "/interactions", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#setup-view"));
    await waitVisible(hostPage.locator("#session-ended-notice"));
    assert.match(await text(hostPage.locator("#session-ended-notice")), /session has ended/i);
    await hostPage.click("#start-new-session");
    await hostPage.waitForFunction(
      () => !document.querySelector("#session-ended-notice") || document.querySelector("#session-ended-notice").hidden,
      null,
      { timeout: 10_000 },
    );
    await waitVisible(hostPage.locator("#setup-view"));
    await audiencePage.waitForURL((url) => url.pathname === "/join", { timeout: 15_000 });

    console.log("12/15 end session from home");
    const pollStart = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "poll",
          title: "Home End Test",
          question: "Ready to finish?",
          options: ["Yes", "No"],
          durationSec: 0,
          spinOnTie: false,
        }),
      });
      return response.status;
    });
    assert.equal(pollStart, 200);
    const homeEndPage = await hostContext.newPage();
    await homeEndPage.goto(server.base + "/", { waitUntil: "domcontentloaded" });
    await homeEndPage.waitForFunction(
      () => !document.querySelector("#landing-end-session")?.disabled,
      null,
      { timeout: 10_000 },
    );
    homeEndPage.on("dialog", (dialog) => dialog.accept());
    await homeEndPage.click("#landing-end-session");
    await homeEndPage.waitForURL((url) => url.pathname === "/thanks-host", { timeout: 15_000 });
    await waitVisible(homeEndPage.locator(".ended-copy h1"));
    await homeEndPage.click("#thanks-start");
    await homeEndPage.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
    await waitVisible(homeEndPage.locator(".landing-option").first());
    await homeEndPage.goto(server.base + "/interactions", { waitUntil: "domcontentloaded" });
    await waitVisible(homeEndPage.locator("#host-app"));
    await audiencePage.waitForURL((url) => url.pathname === "/join", { timeout: 10_000 });
    await homeEndPage.fill("#game-title", "Host End Test");
    await homeEndPage.fill("#question-input", "End from host?");
    await homeEndPage.uncheck("#allow-custom");
    await homeEndPage.click("#start-button");
    await waitVisible(homeEndPage.locator("#open-stage"));
    await waitVisible(audiencePage.locator("#screen-vote"));
    assert.equal(await audiencePage.locator("#vote-write-in").isHidden(), true);
    await homeEndPage.click("#end-session-button");
    await homeEndPage.waitForURL((url) => url.pathname === "/thanks-host", { timeout: 15_000 });
    await waitVisible(homeEndPage.locator(".ended-copy h1"));
    await homeEndPage.close();

    console.log("13/15 direct projector end");
    await hostPage.goto(server.base + "/present", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#present-setup"));
    await waitVisible(hostPage.locator("#present-start"));
    await hostPage.click("#present-start");
    await waitVisible(hostPage.locator("#present-display"));
    hostPage.once("dialog", (dialog) => dialog.accept());
    await hostPage.click("#present-stop");
    await hostPage.waitForURL((url) => url.pathname === "/thanks-host", { timeout: 15_000 });
    await waitVisible(hostPage.locator(".ended-copy h1"));
    await hostPage.goto(server.base + "/present", { waitUntil: "domcontentloaded" });
    assert.equal(await hostPage.locator(".host-header .brand").getAttribute("href"), "/");
    assert.equal(await hostPage.locator('#present-end-session').count(), 1);
    assert.equal(await hostPage.locator('.text-button[href="/share"]').count() >= 1, true);
    assert.equal(await hostPage.locator('.text-button[href="/"]').count() >= 1, true);

    console.log("14/15 end presentation from host");
    await hostPage.goto(server.base + "/present", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#present-setup"));
    await hostPage.click("#present-start");
    await waitVisible(hostPage.locator("#present-display"));
    await audiencePage.waitForURL((url) => url.pathname === "/join", { timeout: 15_000 });
    await waitVisible(audiencePage.locator("#screen-presentation"));
    const hostControlPage = await hostContext.newPage();
    trackPage(hostControlPage, "host-control");
    await hostControlPage.goto(server.base + "/interactions", { waitUntil: "domcontentloaded" });
    await waitVisible(hostControlPage.locator("#host-app"));
    await waitVisible(hostControlPage.locator("#host-end-presentation"));
    assert.equal(await hostControlPage.locator("#end-session-button").isHidden(), false);
    assert.equal(await text(hostControlPage.locator("#end-session-button")), "End session");

    const interactionStatus = await hostControlPage.evaluate(async () => {
      const response = await fetch("/api/host/open", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "poll",
          question: "End interaction check?",
          options: ["Yes", "No"],
          durationSec: 0,
          allowCustom: false,
        }),
      });
      return response.status;
    });
    assert.equal(interactionStatus, 200);
    await waitVisible(audiencePage.locator("#screen-vote"));
    await hostControlPage.waitForFunction(
      () => document.querySelector("#end-session-button")?.textContent === "End interaction",
      null,
      { timeout: 10_000 },
    );
    hostControlPage.once("dialog", (dialog) => dialog.accept());
    await hostControlPage.click("#end-session-button");
    await waitVisible(audiencePage.locator("#screen-presentation"), 15_000);
    await waitVisible(hostControlPage.locator("#host-app"));
    await hostControlPage.waitForFunction(
      () => document.querySelector("#end-session-button")?.textContent === "End session",
      null,
      { timeout: 10_000 },
    );

    hostControlPage.once("dialog", (dialog) => dialog.accept());
    await hostControlPage.click("#host-end-presentation");
    await hostControlPage.waitForURL((url) => url.pathname === "/thanks-host", { timeout: 15_000 });
    await waitVisible(hostControlPage.locator(".ended-copy h1"));
    await hostPage.waitForURL((url) => url.pathname === "/thanks-host", { timeout: 15_000 });
    await hostControlPage.close();

    console.log("15/15 no-slide controller session");
    await hostPage.goto(server.base + "/present", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#present-setup"));
    const tokenBeforeDiscard = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/state", { credentials: "same-origin" });
      return (await response.json()).presentationToken;
    });
    hostPage.once("dialog", (dialog) => dialog.accept());
    await hostPage.click("#present-discard");
    await hostPage.waitForFunction(() => document.querySelector("#present-start")?.textContent?.includes("Start session"));
    await waitVisible(hostPage.locator("#present-qr-panel"));
    const tokenAfterDiscard = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/state", { credentials: "same-origin" });
      return (await response.json()).presentationToken;
    });
    assert.equal(tokenAfterDiscard, tokenBeforeDiscard);
    await hostPage.click("#present-new-controller");
    await hostPage.waitForFunction(() => document.querySelector("#present-status")?.textContent?.includes("New controller link"));
    assert.equal(await hostPage.locator("#present-start").isEnabled(), true);
    await hostPage.click("#present-start");
    await waitVisible(hostPage.locator("#present-display"));
    await waitVisible(hostPage.locator("#present-no-slides"));
    const noSlideToken = await hostPage.evaluate(async () => {
      const response = await fetch("/api/host/state", { credentials: "same-origin" });
      return (await response.json()).presentationToken;
    });
    const noSlideController = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const noSlidePage = await noSlideController.newPage();
    trackPage(noSlidePage, "no-slide-controller");
    await noSlidePage.goto(`${server.base}/controller?token=${encodeURIComponent(noSlideToken)}`, {
      waitUntil: "domcontentloaded",
    });
    await waitVisible(noSlidePage.locator("#controller-live"));
    assert.match(await text(noSlidePage.locator("#controller-note")), /No slides yet/);
    await noSlideController.close();

    await hostPage.goto(server.base + "/interactions", { waitUntil: "domcontentloaded" });
    await waitVisible(hostPage.locator("#host-app"));
    hostPage.once("dialog", (dialog) => dialog.accept());
    await hostPage.setInputFiles("#import-questions-input", {
      name: "write-in-flags.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          title: "Write-in flag check",
          questions: [
            { question: "First?", options: ["A", "B"], durationSec: 0, allowCustom: false },
            { question: "Second?", options: ["C", "D"], durationSec: 0, allowCustom: true },
          ],
        }),
      ),
    });
    await hostPage.waitForFunction(
      () => document.querySelector("#session-count")?.textContent?.includes("2"),
      null,
      { timeout: 10_000 },
    );
    await hostPage.click("#start-button");
    await waitVisible(hostPage.locator("#survey-stage"), 15_000);
    const surveyFlags = await hostPage.evaluate(async () => {
      const response = await fetch("/api/state");
      const state = (await response.json()).state;
      return state.survey?.questions?.map((question) => question.allowCustom);
    });
    assert.deepEqual(surveyFlags, [false, true]);
    await hostPage.evaluate(async () => {
      await fetch("/api/host/reset", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    });

    assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join("; ")}`);
    console.log("15/15 done");
    console.log("SMOKE OK");
  } catch (error) {
    await saveArtifacts(error);
    throw error;
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
