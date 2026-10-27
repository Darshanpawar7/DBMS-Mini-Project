import { expect, test, type Page } from "@playwright/test";

// End-to-end flows through the real UI, API and database.
async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("anonymous visitors are sent to the login page", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("wrong password shows an error", async ({ page }) => {
  await logIn(page, "darshan.pawar@scholarmesh.test", "wrong-password1");
  // (Next.js adds its own hidden route-announcer alert, so match ours by text)
  await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password" })).toBeVisible();
});

test.describe.serial("student journey", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await logIn(page, "darshan.pawar@scholarmesh.test", "Scholar@123");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("dashboard shows stats, feed and recommendations", async () => {
    await expect(page.getByRole("heading", { name: "Good to see you, Darshan." })).toBeVisible();
    await expect(page.getByText("Groups for you")).toBeVisible();
    await expect(page.getByText("New in your courses")).toBeVisible();
  });

  test("semantic search finds a note with no shared keywords", async () => {
    await page.goto("/search");
    await page.getByRole("radio", { name: "Semantic" }).click();
    await page.getByLabel("Search query").fill("how do models decide which words matter");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const results = page.locator("ol > li");
    await expect(results.first()).toBeVisible();
    await expect(results.filter({ hasText: "Transformers and Self-Attention Explained" })).toHaveCount(1);
  });

  test("keyword search highlights the matched term", async () => {
    await page.goto("/search?q=BCNF&mode=keyword");
    await expect(page.locator("mark", { hasText: /bcnf/i }).first()).toBeVisible();
  });

  test("another student's private note is not reachable", async () => {
    await page.goto("/documents?q=K-Means");
    await expect(page.getByText("K-Means Clustering Step by Step")).toHaveCount(0);
  });

  test("upload a note by pasting text, then delete it", async () => {
    await page.goto("/documents/new");
    await page.getByRole("button", { name: "Paste text" }).click();
    await page.getByLabel("Text").fill(
      "Write-ahead logging records every change in a log before it touches the data files.\n\nAfter a crash the database replays the log to redo committed work and undo the rest.",
    );
    await page.getByLabel("Title").fill("E2E: Write-ahead logging");
    await page.getByLabel("Visibility").selectOption("private");
    await page.getByLabel("Tags").fill("recovery, transactions");
    await page.getByRole("button", { name: "Upload note" }).click();

    await expect(page.getByRole("heading", { name: "E2E: Write-ahead logging" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("#recovery")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/documents\?scope=mine/);
    await expect(page.getByText("E2E: Write-ahead logging")).toHaveCount(0);
  });

  test("a full study group refuses another member", async () => {
    await page.goto("/groups");
    await page.getByRole("link", { name: "Query Optimizers" }).first().click();
    await expect(page.getByRole("heading", { name: "Query Optimizers" })).toBeVisible();
    await page.getByRole("button", { name: /Join \(full/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "This study group is full (4 of 4 seats taken)" })).toBeVisible();
  });

  test("students cannot open admin pages", async () => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test("admin sees the platform overview and the audit log", async ({ page }) => {
  await logIn(page, "admin@scholarmesh.test", "Admin@12345");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
  await expect(page.getByText("Content gaps")).toBeVisible();
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
});
