export interface OptionChainRow {
  contractId: string;
  expiry: string;
  strike: number;
  type: "call" | "put";
  volume: number;
  openInterest: number;
  iv?: number;
  delta?: number;
  gamma?: number;
  last?: number;
}

export interface UnusualOptionHit extends OptionChainRow {
  volumeOpenInterestRatio: number;
  notionalProxy: number;
  score: number;
  evidence: string[];
  limitations: string[];
}

export interface GammaStrike {
  strike: number;
  callGamma: number;
  putGamma: number;
  netGammaProxy: number;
}

export interface GammaProfile {
  byStrike: GammaStrike[];
  gammaNeutralEstimate: number | null;
  netGammaProxy: number;
  disclaimer: string;
}

const round = (value: number, places = 2) => {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

export const demoOptionChain: OptionChainRow[] = [
  {
    contractId: "NVDA260619C00220000",
    expiry: "2026-06-19",
    strike: 220,
    type: "call",
    volume: 18_400,
    openInterest: 4_250,
    iv: 0.44,
    delta: 0.42,
    gamma: 0.012,
    last: 9.85
  },
  {
    contractId: "NVDA260619P00190000",
    expiry: "2026-06-19",
    strike: 190,
    type: "put",
    volume: 3_200,
    openInterest: 7_800,
    iv: 0.39,
    delta: -0.28,
    gamma: 0.009,
    last: 4.1
  },
  {
    contractId: "NVDA260717C00240000",
    expiry: "2026-07-17",
    strike: 240,
    type: "call",
    volume: 22_100,
    openInterest: 3_100,
    iv: 0.48,
    delta: 0.31,
    gamma: 0.01,
    last: 7.2
  },
  {
    contractId: "NVDA260717P00180000",
    expiry: "2026-07-17",
    strike: 180,
    type: "put",
    volume: 2_100,
    openInterest: 2_800,
    iv: 0.42,
    delta: -0.2,
    gamma: 0.007,
    last: 3.35
  }
];

export function scanUnusualOptions(chain: OptionChainRow[], spot: number, minimumVolume = 1_000): UnusualOptionHit[] {
  return chain
    .filter((row) => row.volume >= minimumVolume && row.openInterest > 0)
    .map((row) => {
      const volumeOpenInterestRatio = row.volume / row.openInterest;
      const moneynessPenalty = Math.abs(row.strike - spot) / Math.max(spot, 1);
      const notionalProxy = row.volume * (row.last ?? 0) * 100;
      const score = volumeOpenInterestRatio * 35 + Math.log10(Math.max(row.volume, 10)) * 12 - moneynessPenalty * 40;

      return {
        ...row,
        volumeOpenInterestRatio: round(volumeOpenInterestRatio, 2),
        notionalProxy: round(notionalProxy),
        score: round(score, 1),
        evidence: [
          `${row.volume.toLocaleString()} contracts traded against ${row.openInterest.toLocaleString()} open interest.`,
          `Volume/OI ratio ${round(volumeOpenInterestRatio, 2)} and notional proxy $${round(notionalProxy).toLocaleString()}.`
        ],
        limitations: [
          "Demo/persisted chain only; live production scans need a licensed provider.",
          "Direction is inferred from contract type and Greeks, not from buyer/seller aggressor data."
        ]
      };
    })
    .filter((row) => row.volumeOpenInterestRatio >= 1.5 || row.score >= 80)
    .sort((left, right) => right.score - left.score);
}

export function buildGammaProfile(chain: OptionChainRow[], spot: number): GammaProfile {
  const buckets = new Map<number, GammaStrike>();

  for (const row of chain) {
    const gamma = (row.gamma ?? 0) * row.openInterest * 100 * spot;
    const signedGamma = row.type === "call" ? gamma : -gamma;
    const current = buckets.get(row.strike) ?? { strike: row.strike, callGamma: 0, putGamma: 0, netGammaProxy: 0 };
    if (row.type === "call") current.callGamma += gamma;
    else current.putGamma += -gamma;
    current.netGammaProxy += signedGamma;
    buckets.set(row.strike, current);
  }

  const byStrike = [...buckets.values()]
    .map((row) => ({
      strike: row.strike,
      callGamma: round(row.callGamma),
      putGamma: round(row.putGamma),
      netGammaProxy: round(row.netGammaProxy)
    }))
    .sort((left, right) => left.strike - right.strike);
  const closestToNeutral = byStrike.reduce<GammaStrike | null>((best, row) => {
    if (!best) return row;
    return Math.abs(row.netGammaProxy) < Math.abs(best.netGammaProxy) ? row : best;
  }, null);

  return {
    byStrike,
    gammaNeutralEstimate: closestToNeutral?.strike ?? null,
    netGammaProxy: round(byStrike.reduce((sum, row) => sum + row.netGammaProxy, 0)),
    disclaimer: "Dealer gamma is a proxy from public chain OI/Greeks; actual market-maker inventory is not observable."
  };
}
