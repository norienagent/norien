import { env } from '../config/env.js';
import { aggregatorService, type AggregatorService } from './external/aggregator.js';
import type { Token } from './external/types.js';

/**
 * AI Signals — the deterministic half.
 *
 * The value (and the honesty) is here: signals are computed from live Robinhood
 * Chain data with plain rules, not invented by a model. The LLM only ranks these
 * candidates and writes a one-line rationale over the numbers it is handed, so a
 * weak/free model can't hallucinate prices or fabricate alpha.
 *
 * These are observations, not advice.
 */

export type SignalTag =
  | 'momentum-up'
  | 'momentum-down'
  | 'high-activity'
  | 'fresh-launch'
  | 'thin-risky';

export interface SignalCandidate {
  symbol: string;
  name: string;
  address: string;
  price: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidity: number | null;
  holders: number | null;
  ageHours: number | null;
  /** volume / liquidity — how much churn relative to depth. */
  activity: number | null;
  tags: SignalTag[];
  score: number;
}

const TAG_WEIGHT: Record<SignalTag, number> = {
  'momentum-up': 3,
  'momentum-down': 2,
  'high-activity': 2.5,
  'fresh-launch': 2,
  'thin-risky': 1.5,
};

export class SignalsService {
  constructor(private readonly aggregator: AggregatorService = aggregatorService) {}

  /** Pulls live data and derives labelled candidate signals, ranked by score. */
  async detect(limit = 12): Promise<{ signals: SignalCandidate[]; generatedAt: string; degraded: boolean }> {
    const chainId = env.ROBINHOOD_CHAIN_ID;

    const [gainers, volume, fresh] = await Promise.all([
      this.aggregator.listTokens({ chainId, limit: 30, ranking: 'change24' }),
      this.aggregator.listTokens({ chainId, limit: 30, ranking: 'volume24' }),
      this.aggregator.getNewTokens(chainId, 20),
    ]);

    const degraded = gainers.degraded || volume.degraded || fresh.degraded;

    // Merge unique tokens by address.
    const byAddress = new Map<string, Token>();
    for (const t of [...gainers.data.items, ...volume.data.items, ...fresh.data.items]) {
      byAddress.set(t.address.toLowerCase(), t);
    }

    const now = Date.now() / 1000;
    const candidates: SignalCandidate[] = [];

    for (const t of byAddress.values()) {
      const liq = t.liquidity ?? 0;
      const vol = t.volume24h ?? 0;
      const change = t.change24h;
      const ageHours = t.createdAt ? (now - t.createdAt) / 3600 : null;
      const activity = liq > 0 ? vol / liq : null;

      const tags: SignalTag[] = [];
      // Momentum is a *real* move, not a fresh-listing artifact: freshly-listed
      // tokens routinely show meaningless 5-digit % changes, so cap the range.
      if (change != null && change >= 15 && change <= 300 && liq >= 3000) tags.push('momentum-up');
      if (change != null && change <= -15 && change >= -90 && liq >= 3000) tags.push('momentum-down');
      if (activity != null && activity >= 3 && vol >= 5000) tags.push('high-activity');
      if (ageHours != null && ageHours <= 24 && liq >= 2000) tags.push('fresh-launch');
      if (liq > 0 && liq < 2000 && change != null && Math.abs(change) >= 20) tags.push('thin-risky');

      if (tags.length === 0) continue;

      const score =
        tags.reduce((n, tag) => n + TAG_WEIGHT[tag], 0) +
        Math.min(2, Math.log10(Math.max(vol, 1)) / 3); // small nudge for real volume

      candidates.push({
        symbol: t.symbol,
        name: t.name,
        address: t.address,
        price: t.price,
        change24h: change,
        volume24h: t.volume24h,
        liquidity: t.liquidity,
        holders: t.holders,
        ageHours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
        activity: activity != null ? Math.round(activity * 100) / 100 : null,
        tags,
        score: Math.round(score * 100) / 100,
      });
    }

    candidates.sort((a, b) => b.score - a.score);

    return {
      signals: candidates.slice(0, limit),
      generatedAt: new Date().toISOString(),
      degraded,
    };
  }
}

export const signalsService = new SignalsService();
