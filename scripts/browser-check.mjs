import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const server = spawn(process.execPath, ["backend/server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, LOKALBLICK_PORT: "8799" },
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("error", reject);
    server.once("exit", (code) => reject(Error("Test server exited: " + code)));
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {}),
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
    ],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://**/*",route=>route.abort());
  await page.goto("http://127.0.0.1:8799/v2/index.html");
  await page.waitForSelector("tbody tr");
  assert.equal(await page.locator("tbody tr").count(), 3);
  for (const view of ["contracts", "plan", "budget", "sources", "people"]) {
    await page.locator(`.sidebar [data-view="${view}"]`).click();
    assert.ok((await page.locator("#content").innerText()).length > 50);
  }
  await page.locator('.sidebar [data-view="contracts"]').click();
  await page.locator('[data-edit="contracts"]').first().click();
  assert.equal(await page.locator("#edit-form").count(), 1);
  assert.equal(
    await page
      .locator(".editor")
      .evaluate((x) => x.scrollHeight > x.clientHeight),
    false,
  );
  await page.locator('[data-editor-tab="Ekonomi"]').click();
  await page.locator('[name="annualRent"]').fill("123456");
  await page.locator('#edit-form [type="submit"]').click();
  await page.waitForSelector("#edit-form", { state: "detached" });
  await page.reload();
  await page.waitForSelector("tbody");
  await page.locator('.sidebar [data-view="contracts"]').click();
  await page.locator('[data-edit="contracts"]').first().click();
  await page.locator('[data-editor-tab="Ekonomi"]').click();
  assert.equal(
    await page.locator('[name="annualRent"]').inputValue(),
    "123456",
  );
  await page.locator("[data-editor-close]").click();
  await page.locator('.sidebar [data-view="plan"]').click();
  const select = page.locator("[data-assign]").first();
  const current = await select.inputValue();
  const person = await select
    .locator("option")
    .evaluateAll(
      (options, current) =>
        options.map((x) => x.value).find((x) => x && x !== current),
      current,
    );
  await select.selectOption(person);
  await page.waitForTimeout(150);
  await page.getByText(/Ansvarsändringar/).click();
  assert.ok(
    (await page.locator("#content").innerText()).includes("Demoanvändare"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of ["overview", "plan", "budget", "sources"]) {
    await page.locator(`.mobile-nav [data-view="${view}"]`).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: desktop/mobile navigation, editor fit, save/reload, assignment audit, no horizontal overflow or page errors.",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
