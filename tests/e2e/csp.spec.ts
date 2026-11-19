import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";

/**
 * Serves the production build with the CSP and headers from netlify.toml and checks the
 * login screen renders with no CSP violations. /api/* answers 401 like a signed-out session.
 */
const DIST = join(process.cwd(), "dist");
const toml = readFileSync(join(process.cwd(), "netlify.toml"), "utf8");
const csp = toml.match(/Content-Security-Policy = "([^"]+)"/)?.[1] ?? "";
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain" };
let server: Server;
const PORT = 5181;

test.beforeAll(async () => {
  test.skip(!existsSync(join(DIST, "index.html")), "run npm run build first");
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const headers = { "Content-Security-Policy": csp.replace("; upgrade-insecure-requests", ""), "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(401, { ...headers, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Not signed in" }));
    }
    let file = normalize(join(DIST, url.pathname));
    if (!file.startsWith(DIST) || !existsSync(file) || url.pathname === "/") file = join(DIST, "index.html");
    res.writeHead(200, { ...headers, "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(PORT, r));
});

test.afterAll(async () => {
  await new Promise((r) => server?.close(r));
});

test("production build renders the login screen under the CSP with no violations", async ({ page }) => {
  expect(csp).toContain("default-src 'self'");
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/401/.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(`http://localhost:${PORT}`) && !r.url().startsWith("data:")) external.push(r.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://localhost:${PORT}/`);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByLabel("Passphrase")).toBeVisible();
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  expect(robots).toContain("noindex");
  await page.screenshot({ path: "screenshots/login-390.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "screenshots/login-1440.png" });
  expect(problems).toEqual([]);
  expect(external).toEqual([]);
});
