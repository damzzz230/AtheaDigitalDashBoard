import { expect, test, type Page } from "@playwright/test";

const SCREENS = [
  { path: "/", name: "today", heading: "Today" },
  { path: "/pipeline", name: "pipeline", heading: "Pipeline" },
  { path: "/projects", name: "projects", heading: "Projects" },
  { path: "/money", name: "money", heading: "Money" },
  { path: "/capacity", name: "capacity", heading: "Capacity" },
  { path: "/sites", name: "sites", heading: "Sites" },
  { path: "/marketing", name: "marketing", heading: "Marketing" },
  { path: "/settings", name: "settings", heading: "Settings" },
];
const WIDTHS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];
const EMPTY = JSON.stringify({ leads: {}, projects: {}, invoices: {}, retainers: {}, hours: {}, sites: {}, marketing: {}, costs: {}, settings: {} });

async function prepare(page: Page, state: "seed" | "empty" | "sample") {
  await page.goto("/");
  await page.evaluate((e) => {
    localStorage.clear();
    if (e) localStorage.setItem("athea-dashboard:v1", e);
  }, state === "empty" ? EMPTY : null);
  if (state === "sample") {
    await page.goto("/settings");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Load SAMPLE data" }).click();
    await expect(page.getByText(/leads in local storage/)).toContainText(/1[0-9] leads/);
  }
}

async function checkPage(page: Page, name: string, width: number, state: string, errors: string[]) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${name} @${width} (${state}) scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `screenshots/${state}/${name}-${width}.png`, fullPage: true });
  expect(errors, `console errors on ${name}`).toEqual([]);
}

for (const state of ["seed", "empty", "sample"] as const) {
  for (const { w, h } of WIDTHS) {
    test(`${state} screens at ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await prepare(page, state);
      for (const s of SCREENS) {
        await page.goto(s.path);
        await expect(page.getByRole("heading", { level: 1, name: s.heading })).toBeVisible();
        await page.waitForTimeout(700);
        await checkPage(page, s.name, w, state, errors);
      }
      if (state !== "empty") {
        await page.goto("/projects");
        await page.locator("table.data tbody tr").first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.waitForTimeout(500);
        await checkPage(page, "project-drawer", w, state, errors);
      }
    });
  }
}

test("seed facts and rules show up", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page, "seed");
  await page.goto("/");
  await expect(page.getByText("Add the preview date for The Southern Rebellion")).toBeVisible();
  await expect(page.getByText("Move Athea Digital to the Athea Netlify account")).toBeVisible();
  await expect(page.getByText("TopDraw Projects: 7-day check")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByText("Unconfirmed", { exact: true })).toHaveCount(2);
  await page.goto("/marketing");
  await expect(page.getByText("GA not connected")).toBeVisible();
  await page.goto("/pipeline");
  await page.getByRole("button", { name: "Add lead" }).click();
  await expect(page.getByText("No passwords or banking details here.").first()).toBeVisible();
});

test("glass is applied and blurs on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page, "seed");
  await page.goto("/");
  const style = await page.locator(".glass").first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { filter: cs.backdropFilter || (cs as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter, radius: cs.borderRadius };
  });
  expect(style.filter).toContain("blur(20px)");
  expect(style.radius).toBe("20px");
  expect(await page.locator(".glass-featured").count()).toBeGreaterThan(0);
});

test("second editor gets a conflict prompt, not a silent overwrite", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctx.newPage();
  await a.goto("/");
  await a.evaluate(() => localStorage.clear());
  await a.goto("/projects?open=p-topdraw");
  const b = await ctx.newPage();
  await b.goto("/projects?open=p-topdraw");
  const notesA = a.getByRole("dialog").getByLabel("Notes");
  await notesA.fill("Edited by tab A");
  await a.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(a.getByRole("dialog").getByText(/Version 2/)).toBeVisible();
  const notesB = b.getByRole("dialog").getByLabel("Notes");
  await notesB.fill("Edited by tab B");
  await b.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(b.getByRole("heading", { name: "Someone else changed this first" })).toBeVisible();
  await b.screenshot({ path: "screenshots/conflict-1440.png" });
  await b.getByRole("button", { name: "Keep theirs" }).click();
  const stored = await b.evaluate(() => JSON.parse(localStorage.getItem("athea-dashboard:v1") ?? "{}").projects["p-topdraw"].notes);
  expect(stored).toBe("Edited by tab A");
  await ctx.close();
});

test("a background refresh mid-edit still gives a conflict prompt", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctx.newPage();
  await a.goto("/");
  await a.evaluate(() => localStorage.clear());
  await a.goto("/projects?open=p-topdraw");
  const b = await ctx.newPage();
  await b.goto("/projects?open=p-topdraw");
  await b.getByRole("dialog").getByLabel("Notes").fill("Das started typing");
  await a.getByRole("dialog").getByLabel("Notes").fill("Damz saved first");
  await a.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(a.getByRole("dialog").getByText(/Version 2/)).toBeVisible();
  // Tab B's data refreshes in the background (as on returning to the app) while its draft is open.
  await b.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(b.getByText("This record changed since you opened it.")).toBeVisible();
  await expect(b.getByRole("dialog").getByLabel("Notes")).toHaveValue("Das started typing");
  await b.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(b.getByRole("heading", { name: "Someone else changed this first" })).toBeVisible();
  await b.getByRole("button", { name: "Keep theirs" }).click();
  const stored = await b.evaluate(() => JSON.parse(localStorage.getItem("athea-dashboard:v1") ?? "{}").projects["p-topdraw"].notes);
  expect(stored).toBe("Damz saved first");
  await ctx.close();
});

test("server rejects a card number typed into notes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page, "seed");
  await page.goto("/pipeline");
  await page.getByRole("button", { name: "Add lead" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Business").fill("Test Co");
  await d.getByLabel("Notes").fill("card 4111 1111 1111 1111");
  await d.getByRole("button", { name: "Add lead" }).click();
  await expect(d.getByText(/looks like a password, card number or bank detail/)).toBeVisible();
});
