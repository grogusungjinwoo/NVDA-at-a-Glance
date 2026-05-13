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

  it("runs an 8:00 PM Eastern research refresh that commits artifacts and deploys Pages", () => {
    const workflow = readFileSync(".github/workflows/daily-research.yml", "utf8");

    expect(workflow).toContain("0 0 * * *");
    expect(workflow).toContain("0 1 * * *");
    expect(workflow).toContain("20:00");
    expect(workflow).toContain("America/New_York");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("pages: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("npm run refresh:data");
    expect(workflow).toContain("git commit -m \"chore: refresh NVDA research artifacts\"");
    expect(workflow).toContain("actions/upload-pages-artifact@v3");
    expect(workflow).toContain("actions/deploy-pages@v4");
  });
});
