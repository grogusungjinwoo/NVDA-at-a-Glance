import { describe, expect, it } from "vitest";
import { buildGammaProfile, demoOptionChain, scanUnusualOptions } from "./optionsModel";

describe("options chain proxy model", () => {
  it("flags unusual volume and open-interest prints from persisted/demo chain rows", () => {
    const hits = scanUnusualOptions(demoOptionChain, 210);

    expect(hits.map((hit) => hit.contractId)).toEqual([
      "NVDA260717C00240000",
      "NVDA260619C00220000"
    ]);
    expect(hits[0].evidence.join(" ")).toContain("Volume/OI ratio");
    expect(hits[0].limitations.join(" ")).toContain("licensed provider");
  });

  it("builds a gamma-neutral proxy without claiming real dealer inventory", () => {
    const profile = buildGammaProfile(demoOptionChain, 210);

    expect(profile.byStrike.length).toBeGreaterThan(0);
    expect(profile.gammaNeutralEstimate).not.toBeNull();
    expect(profile.disclaimer).toContain("proxy from public chain OI/Greeks");
  });
});
