import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("GitHub Pages deployment config", () => {
  it("uses the NVDA at a Glance project base path", () => {
    const viteConfig = readFileSync("vite.config.ts", "utf8");

    expect(viteConfig).toContain('base: "/NVDA-at-a-Glance/"');
  });

  it("keeps Pages deploys read-only against committed public artifacts", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("npm run refresh:data");
  });

  it("runs a separate 8:15 PM Eastern research refresh that commits generated artifacts", () => {
    const workflow = readFileSync(".github/workflows/daily-research.yml", "utf8");

    expect(workflow).toContain("15 0 * * *");
    expect(workflow).toContain("15 1 * * *");
    expect(workflow).toContain("America/New_York");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("npm run refresh:data");
    expect(workflow).toContain("git commit -m \"chore: refresh NVDA research artifacts\"");
  });
});
