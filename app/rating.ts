import { RatingDialog } from '../components/RatingDialog';
import type { PlaybackState } from '../types';
import { recordVote } from '../utils/DjRatings';
import { TakeRatingTracker } from '../utils/TakeRating';
import { on } from '../utils/events';
import type { App } from './context';

/** "Like this?": when the music stops after a DJ's take was heard long enough, the listener rates it once; the vote counts for the DJ and for its genre and style. */
export function setupRating(app: App) {
  const { djPresetDialog, leftSidebar, pdjMidi, topToolbar } = app;
  // "Like this?": when the music stops after a DJ's take was heard long enough, the listener rates it once (the take
  // and all its playbacks); the vote counts for the DJ that conducted it (its stars) and for its genre and style
  const ratingDialog = new RatingDialog();
  document.body.appendChild(ratingDialog);
  on(ratingDialog, 'take-rated', ((e) => {
      const t = e.detail.take, like = e.detail.like;
      recordVote(t.djId, t.genre, t.style, like);
      pdjMidi.setMessage(`${like ? '👍' : '👎'} DJ ${t.djName.toUpperCase()} ${like ? 'THANKS YOU' : 'WILL TRY HARDER'}`, 'info');
  }));
  const takeRating = new TakeRatingTracker();
  const trackListening = (state: PlaybackState) => {
      const toRate = takeRating.onState(state, Date.now(), () => leftSidebar.isConductorActive
          ? { djId: djPresetDialog.onDeck.id, djName: djPresetDialog.onDeck.name, genre: topToolbar.genre, style: topToolbar.musicStyle }
          : null);
      if (toRate) { ratingDialog.take = toRate; ratingDialog.show = true; }
  };
  return { ratingDialog, takeRating, trackListening };
}
