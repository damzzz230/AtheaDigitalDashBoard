import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** WCAG AA check of the tokens actually in tokens.css, on glass composited over the brightest background. */
const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`missing token --${name}`);
  return m[1].trim();
};

type RGBA = [number, number, number, number];
function parse(c: string): RGBA {
  if (c.startsWith("#")) {
    const h = c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const [r, g, b, a = "1"] = c.replace(/rgba?\(|\)/g, "").split(",").map((s) => s.trim());
  return [+r, +g, +b, +a];
}
const over = (top: RGBA, under: RGBA): RGBA => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1) as RGBA;
const lum = ([r, g, b]: RGBA) => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGBA, b: RGBA) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const bg = parse(token("bg"));
const glow = parse(token("glow"));
// The glow peaks at 30% (see .app-bg); also lighten by the top-left card gradient highlight.
const brightestBg = over([...glow.slice(0, 3), 0.3] as RGBA, bg);
const glassOnBright = over([34, 78, 70, 0.5], over(parse(token("glass")), brightestBg));
const glassOnDark = over(parse(token("glass")), bg);
const solid = parse(token("glass-solid"));

describe("text on glass meets WCAG AA (4.5:1)", () => {
  for (const name of ["text", "muted", "accent-text", "ok", "warn", "bad"]) {
    it(`--${name}`, () => {
      const fg = parse(token(name));
      for (const surface of [glassOnBright, glassOnDark, solid]) {
        expect(ratio(fg, surface)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
  it("white button text on --accent-strong", () => {
    expect(ratio([255, 255, 255, 1], parse(token("accent-strong")))).toBeGreaterThanOrEqual(4.5);
  });
});
