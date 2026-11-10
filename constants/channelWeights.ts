/**
 * How strongly a channel is asked for (its WGT slider). Every channel runs 0 to 1, except the lead: it may go up to
 * 1.5, so the melody can always ride above the other channels. The slider, the dice, the style presets and the DJ all
 * keep to these ceilings, whichever DJ conducts.
 */
import type { ChannelKey } from '../types';

export const CHANNEL_WEIGHT_MAX: Record<ChannelKey, number> = { lead: 1.5, alto: 1, harmonic: 1, bass: 1, rhythm: 1 };

/** What a DJ stage multiplies the lead's weight by (the lead stays above the others even as a supporting player) */
export const LEAD_WEIGHT_BOOST = 1.5;

/** A weight kept between 0 and the channel's ceiling */
export function clampChannelWeight(channel: ChannelKey, weight: number): number {
  return Math.max(0, Math.min(CHANNEL_WEIGHT_MAX[channel], weight));
}

/**
 * The weight a DJ stage gives a channel that plays: `base` is 1 for the featured voice or the formation's support
 * weight for the others. The lead gets the boost on top (up to its ceiling), the other channels keep `base`.
 */
export function stageChannelWeight(channel: ChannelKey, base: number): number {
  return clampChannelWeight(channel, channel === 'lead' ? base * LEAD_WEIGHT_BOOST : base);
}
