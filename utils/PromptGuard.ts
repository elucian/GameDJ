/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// Runtime memory for prompts that Lyria's safety filter rejected.
//
// - A rejected prompt is remembered (in localStorage too) and never sent again as it was.
// - It is improved on the fly: first by simple rules (drop artist/song references and quoted lyrics, swap words
//   that were rejected before, shorten), then, if the rewrite is rejected as well, by asking a Gemini text model for a
//   safe rewrite. A prompt that keeps failing is dropped for good.
// - Phrases that had to be removed are remembered too and are removed from all later prompts before they are sent.

const STORAGE_KEY = 'gamedj.promptGuard';
const MAX_ENTRIES = 300;

export interface PromptImprovement { from: string; to: string | null; how: 'rules' | 'ai' | 'dropped' }
type Prompt = { text: string; weight: number };

// "Kendrick Lamar style", "The Weeknd vibe", "Miles Davis style"...: a proper name followed by a reference word
const NAME_REFERENCE = /\b((?:The\s+)?[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)*)\s+(?:style|vibe|aesthetic|influence|sound design|sound|groove|harmony|harmonies|voicings|complexity|layers|structure|changes|arrangement|grit|energy)\b/g;
// Words that were rejected in tests, with a close, harmless equivalent
const SAFE_SWAPS: [RegExp, string][] = [
    [/\beast coast rap\b/gi, 'boom bap rap'],
    [/\bboys? choir\b/gi, 'youth choir'],
    [/\bchildren'?s? choir\b/gi, 'young singers choir'],
    [/\bvocal chops\b/gi, 'chopped vocal samples'],
    [/\bhuman vocals\b/gi, 'singing voice'],
    [/\bgritty\b/gi, 'raw'],
    [/\bdirective\b/gi, 'direction'],
    [/\bstrictly\b/gi, 'only'],
    [/\bghost instruments?\b/gi, 'extra instruments'],
];

export class PromptGuard {
    /** root prompt -> the rewrite currently used instead of it */
    private rewrites = new Map<string, string>();
    /** root prompts that could not be fixed: never sent */
    private dead = new Set<string>();
    /** phrases that are removed from every prompt before sending (learned from earlier rejections) */
    private removals = new Set<string>();
    /** how many rewrites were tried for a root prompt */
    private attempts = new Map<string, number>();
    /** text actually sent -> root prompt it came from (to trace a server notice back) */
    private sent = new Map<string, string>();
    private pendingAi = new Set<string>();

    constructor(
        private aiRewrite: (text: string) => Promise<string | null>,
        private onImproved: (event: PromptImprovement) => void,
    ) { this.load(); }

    /** Applies the memory to a payload: learned removals, rewrites, and dropping prompts that cannot be fixed. */
    apply(payload: Prompt[]): Prompt[] {
        const out: Prompt[] = [];
        for (const p of payload) {
            const root = this.clean(p.text);
            if (!root || this.dead.has(root)) continue;
            const text = this.rewrites.get(root) ?? root;
            this.sent.set(text, root);
            out.push({ text, weight: p.weight });
        }
        if (this.sent.size > 400) this.sent = new Map([...this.sent].slice(-200));
        return out;
    }

    /** The server rejected `text` (exactly as sent): remember it and improve it. */
    reportRejected(text: string) {
        const root = this.sent.get(text) ?? text;
        const tried = this.attempts.get(root) ?? 0;
        this.attempts.set(root, tried + 1);

        if (tried === 0) {
            const { text: better, removed } = this.ruleRewrite(root);
            removed.forEach(r => this.removals.add(r));
            if (better && better !== root && better !== text) {
                this.rewrites.set(root, better);
                this.save();
                this.onImproved({ from: root, to: better, how: 'rules' });
                return;
            }
        }
        if (tried <= 1 && !this.pendingAi.has(root)) {
            // Rules did not help (or their rewrite was rejected too): ask the model for a safe version
            this.pendingAi.add(root);
            this.aiRewrite(root).then(better => {
                this.pendingAi.delete(root);
                if (better && better !== root && better !== text) {
                    this.rewrites.set(root, better);
                    // A short prompt is a phrase worth remembering for all future prompts
                    if (root.split(/\s+/).length <= 6) this.removals.add(root);
                    this.onImproved({ from: root, to: better, how: 'ai' });
                } else {
                    this.dead.add(root);
                    this.onImproved({ from: root, to: null, how: 'dropped' });
                }
                this.save();
            }).catch(() => { this.pendingAi.delete(root); this.dead.add(root); this.save(); this.onImproved({ from: root, to: null, how: 'dropped' }); });
            return;
        }
        if (tried > 1) {
            this.rewrites.delete(root);
            this.dead.add(root);
            this.save();
            this.onImproved({ from: root, to: null, how: 'dropped' });
        }
    }

    /** Learned removals applied to a text. */
    private clean(text: string): string {
        let t = text;
        this.removals.forEach(r => { t = t.split(r).join(''); });
        return t.replace(/\s{2,}/g, ' ').replace(/\s+([.,:;])/g, '$1').replace(/^[\s.,:;]+/, '').trim();
    }

    private ruleRewrite(text: string): { text: string | null; removed: string[] } {
        const removed: string[] = [];
        let t = text;
        // 1. artist / song references
        t = t.replace(NAME_REFERENCE, (m) => { removed.push(m); return ''; });
        // 2. quoted lyrics ("vocals sung in Hindi: "...")
        t = t.replace(/:\s*"[^"]*"/g, '');
        // 3. words that were rejected before
        SAFE_SWAPS.forEach(([re, to]) => { t = t.replace(re, to); });
        t = t.replace(/\s{2,}/g, ' ').replace(/\s+([.,:;])/g, '$1').replace(/^[\s.,:;]+/, '').trim();
        if (t && t !== text) return { text: t, removed };
        // 4. shorten: keep the first clause
        const first = text.split(/[.:;]|, /)[0].trim().split(/\s+/).slice(0, 8).join(' ');
        return { text: first && first !== text ? first : null, removed };
    }

    private load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const d = JSON.parse(raw);
            this.rewrites = new Map(d.rewrites || []);
            this.dead = new Set(d.dead || []);
            this.removals = new Set(d.removals || []);
        } catch { /* no storage or corrupt: start empty */ }
    }

    private save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                rewrites: [...this.rewrites].slice(-MAX_ENTRIES),
                dead: [...this.dead].slice(-MAX_ENTRIES),
                removals: [...this.removals].slice(-MAX_ENTRIES),
            }));
        } catch { /* ignore */ }
    }
}
