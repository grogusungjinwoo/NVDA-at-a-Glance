import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("GitHub Pages deployment config", () => {
  it("uses the NVDA at a Glance project base path", () => {
    const viteConfig = readFileSync("vite.config.ts", "utf8");

    expect(viteConfig).toContain('base: "/NVDA-at-a-Glance/"');
  });

  it("refreshes market data before scheduled Pages builds", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

    expect(workflow).toContain("0 0,1 * * *");
    expect(workflow).toContain("npm run refresh:data");
  });
});
