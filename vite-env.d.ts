/// <reference types="vite/client" />

/** The app's own build-time settings (.env.local; only VITE_ ones reach the browser) */
interface ImportMetaEnv {
  /** Gemini API key for Lyria RealTime and the lyrics models */
  readonly VITE_API_KEY: string;
  /** Development only: sent as x-dev-secret so api/song.ts renders without a quota ticket (never set in production) */
  readonly VITE_DEV_SONG_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The app's globals on window */
interface Window {
  /** The main bar, for the dialogs that follow its genre and style */
  topToolbar?: import('./components/TopToolbar').TopToolbar;
  liveMusicHelper?: import('./utils/LiveMusicHelper').LiveMusicHelper;
  /** Development only: every prompt Lyria rejected, with the payload it was part of */
  __lyriaFiltered?: { at: string; text?: string; reason: string; payload: unknown; config: unknown }[];
  /** Older Safari */
  webkitAudioContext?: typeof AudioContext;
}
