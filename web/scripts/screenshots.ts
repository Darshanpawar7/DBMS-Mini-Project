/**
 * Captures the application screenshots used in the project report.
 *   npx tsx scripts/screenshots.ts            (dev server must be running on E2E_PORT, default 3100)
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const BASE = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
const OUT = path.resolve(__dirname, "..", "..", "docs", "screenshots");

async function shot(page: Page, name: string, fullPage = true): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500); // let client components and fonts settle
  await page.mouse.move(0, 0); // no stray hover tooltips in the capture
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  console.log(`  saved ${name}.png`);
}

async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(dashboard|admin)/);
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.goto(BASE);
  await shot(page, "01-landing", false);
  await page.goto(`${BASE}/login`);
  await shot(page, "02-login", false);

  await logIn(page, "ananya.rao@scholarmesh.test", "Scholar@123");
  await shot(page, "03-student-dashboard");

  await page.goto(`${BASE}/search?q=${encodeURIComponent("how do models decide which words matter")}&mode=hybrid`);
  await shot(page, "04-search-hybrid");
  await page.goto(`${BASE}/search?q=${encodeURIComponent("bcnf decomposition")}&mode=keyword`);
  await shot(page, "05-search-keyword-no-results");
  await page.goto(`${BASE}/search?q=${encodeURIComponent("bcnf decomposition")}&mode=semantic`);
  await shot(page, "06-search-semantic");

  await page.goto(`${BASE}/documents`);
  await shot(page, "07-library");
  await page.goto(`${BASE}/documents?q=Transformers`);
  await page.getByRole("link", { name: "Transformers and Self-Attention Explained" }).click();
  await shot(page, "08-document-detail");
  await page.goto(`${BASE}/documents/new`);
  await shot(page, "09-upload-form", false);

  await page.goto(`${BASE}/groups`);
  await shot(page, "10-study-groups");
  await page.getByRole("link", { name: "Query Optimizers" }).first().click();
  await page.getByRole("heading", { name: "Query Optimizers" }).waitFor();
  await page.getByRole("button", { name: /Join \(full/ }).click();
  await page.getByRole("alert").filter({ hasText: "full" }).waitFor();
  await shot(page, "11-group-full-trigger");
  await page.goto(`${BASE}/courses`);
  await shot(page, "12-courses");

  // mobile layout check
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.context().addCookies(await context.cookies());
  await mobile.goto(`${BASE}/dashboard`);
  await shot(mobile, "13-mobile-dashboard", false);
  await mobile.close();

  await context.clearCookies();
  await logIn(page, "admin@scholarmesh.test", "Admin@12345");
  await shot(page, "14-admin-overview");
  await page.goto(`${BASE}/admin/users`);
  await shot(page, "15-admin-users");
  await page.goto(`${BASE}/admin/content`);
  await shot(page, "16-admin-courses-tags");
  await page.goto(`${BASE}/admin/audit`);
  await shot(page, "17-admin-audit-log");

  await browser.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
