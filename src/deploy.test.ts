import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("GitHub Pages deployment config", () => {
  it("uses the NVDA at a Glance project base path", () => {
    const viteConfig = readFileSync("vite.config.ts", "utf8");

    expect(viteConfig).toContain('base: "/NVDA-at-a-Glance/"');
  });
});
