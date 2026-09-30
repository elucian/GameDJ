
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
export interface Prompt {
  readonly promptId: string;
  text: string;
  weight: number;
  volume: number; 
  cc: number;
  color: string;
}

export interface ControlChange {
  channel: number;
  cc: number;
  value: number;
}

export type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused' | 'recording' | 'warmup' | 'preparing' | 'loop-waiting' | 'rewinding';

export type MusicGenerationMode = 'QUALITY' | 'DIVERSITY' | 'VOCALIZATION';

export interface ChannelState {
  instrument: string;
  active: boolean;
  weight: number; 
  visible?: boolean; 
  /** How strictly Lyria should follow this channel, 0..1 (maps to Lyria guidance 1..5; the DJ may push it up to 6). */
  guidance?: number;
}

export interface InstrumentSet {
  lead: ChannelState;
  alto: ChannelState;
  harmonic: ChannelState;
  bass: ChannelState;
  rhythm: ChannelState;
}

export interface PlaybackSnapshot {
  timestamp: number;
  promptWeights: Map<string, number>;
  channelWeights: { lead: number; alto: number; harmonic: number; bass: number; rhythm: number };
  channelActive: { lead: boolean; alto: boolean; harmonic: boolean; bass: boolean; rhythm: boolean };
  statusMessage?: string;
  isAiPhase?: boolean;
}
