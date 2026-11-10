/**
 * What the app's parts share. index.tsx builds one `App` and hands it to each part's setupX(app) (the files in this
 * folder). The components made first are ready at setup; `liveMusicHelper`, `toastMessage` and the actions are read
 * when used (getters), since main() makes them later than some parts are set up.
 */
import type { TopToolbar } from '../components/TopToolbar';
import type { LeftSidebar } from '../components/LeftSidebar';
import type { RightSidebar } from '../components/RightSidebar';
import type { VocalDialog } from '../components/VocalDialog';
import type { DjPresetDialog } from '../components/DjPresetDialog';
import type { Timeline } from '../components/Timeline';
import type { PromptDjMidi } from '../components/PromptDjMidi';
import type { ToastMessage } from '../components/ToastMessage';
import type { LiveMusicHelper } from '../utils/LiveMusicHelper';
import type { InstrumentSet } from '../types';

/** main()'s functions the parts call (each read when it is called) */
export interface Actions {
  /** Any user action stops the "auto-loop in 20 s" countdown */
  readonly cancelAutoLoop: () => void;
  /** The Voice button follows the song quota */
  readonly syncVoiceBlocked: () => void;
  /** The display's prompt panel shows what goes to Lyria */
  readonly refreshPromptPanel: () => void;
  /** Voice mode off: voices on the channels are swapped for instruments (except `keep`; `force` in voice mode too) */
  readonly replaceVocalInstruments: (keep?: (keyof InstrumentSet)[], force?: boolean, ignoreLock?: boolean) => void;
  /** Voice mode on: a voice channel is placed when none sings */
  readonly ensureVoiceChannels: () => void;
  /** Songs left this month and a key that may use Lyria 3.5 */
  readonly songsAvailable: () => boolean;
  /** Back to the live model: Band tab, voice mode off */
  readonly fallBackToLive: () => void;
  /** The DJ hands the voices over (or stays, with a reason) */
  readonly djStepsDownForVoices: (why: string) => void;
  /** The Voice dialog shows what the voice channels hold */
  readonly syncVoiceDialog: () => void;
}

export interface App {
  readonly topToolbar: TopToolbar;
  readonly leftSidebar: LeftSidebar;
  readonly rightSidebar: RightSidebar;
  readonly vocalDialog: VocalDialog;
  readonly djPresetDialog: DjPresetDialog;
  readonly timeline: Timeline;
  readonly pdjMidi: PromptDjMidi;
  /** Made later in main(): read it when used, not at setup */
  readonly liveMusicHelper: LiveMusicHelper;
  /** Made later in main(): read it when used, not at setup */
  readonly toastMessage: ToastMessage;
  readonly actions: Actions;
}
