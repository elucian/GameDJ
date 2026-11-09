import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The event maps (`XxxEvents` interfaces, see utils/events.ts) are types only: nothing makes the component really
 * send what its map lists. This test reads each source file and checks both ways: every listed event is sent
 * there, and every event the component sends on itself is listed (events sent on window are not the component's).
 */
const ROOT = join(__dirname, '..');
const FILES = [
  ...readdirSync(join(ROOT, 'components')).filter(f => f.endsWith('.ts')).map(f => `components/${f}`),
  'utils/LiveMusicHelper.ts', 'utils/AudioAnalyser.ts',
];

function eventMap(src: string): string[] | null {
  const m = /export interface \w+Events \{([\s\S]*?)\n\}/.exec(src);
  if (!m) return null;
  return [...m[1].matchAll(/'([a-z0-9-]+)'\s*:/g)].map(x => x[1]);
}

function sentEvents(src: string): string[] {
  const sent = new Set<string>();
  for (const m of src.matchAll(/(window\.dispatchEvent\(\s*)?(?:new CustomEvent|\bdispatch)\(\s*'([a-z0-9-]+)'/g)) {
    if (!m[1]) sent.add(m[2]);
  }
  return [...sent];
}

const withMaps = FILES.map(f => ({ file: f, src: readFileSync(join(ROOT, f), 'utf8') }))
  .map(x => ({ ...x, map: eventMap(x.src) }))
  .filter((x): x is { file: string; src: string; map: string[] } => x.map !== null);

describe('event maps', () => {
  it('exist for the components the app listens to', () => {
    const files = withMaps.map(x => x.file);
    for (const f of ['components/LeftSidebar.ts', 'components/RightSidebar.ts', 'components/TopToolbar.ts', 'components/Timeline.ts', 'utils/LiveMusicHelper.ts']) {
      expect(files).toContain(f);
    }
  });

  for (const { file, src, map } of withMaps) {
    describe(file, () => {
      const sent = sentEvents(src);
      it('sends every event its map lists', () => {
        expect(map.filter(e => !sent.includes(e))).toEqual([]);
      });
      it('lists every event it sends', () => {
        expect(sent.filter(e => !map.includes(e))).toEqual([]);
      });
    });
  }
});
