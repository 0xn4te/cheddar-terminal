// Shared types between CryptoValuation page and the protocol detail modal.
// Lives outside the page module so the modal subcomponents don't pull in the
// page's runtime code (they'd circular-import otherwise).

export interface SubEntry {
  name: string;
  total7d: number;
  total30d: number;
}

export interface ProtocolRow {
  // identity
  name: string;
  slug: string;
  category: string;
  chains: string[];
  logo: string | null;
  gecko_id: string | null;

  // valuations
  mcap: number;
  fdv: number;
  tvl: number;

  // raw revenue figures from DefiLlama, summed across child fee entries
  total24h: number;
  total7d: number;
  total30d: number;
  total1y: number;

  // computed (depend on user-selected period + valuation)
  annRev: number;
  periodRev: number;
  ps: number | null;
  revTvl: number | null;
  change: number | null;
  change30: number | null;

  // aggregation provenance
  subCount: number;
  subNames: string[];
  subEntries: SubEntry[];
  aggregated: boolean;

  // meta
  mcapSource: 'defillama' | 'coingecko' | 'user-override' | null;
  dexscreener: string | null;
}
