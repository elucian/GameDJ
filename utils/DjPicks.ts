/** What a DJ picks from the app's music: only the genre and style names matter here. */
export type StyleCatalog = Record<string, { styles: Record<string, unknown> }>;

const pickOne = <T>(list: T[], random: () => number): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/**
 * The Robot DJ studies humanity: any genre, every genre equally likely (however many styles it has), then any style
 * of it. Null when the catalog has no style at all.
 */
export function pickAnyStyle(catalog: StyleCatalog, random: () => number = Math.random): [string, string] | null {
    const genres = Object.keys(catalog).filter(g => Object.keys(catalog[g].styles).length > 0);
    if (genres.length === 0) return null;
    const genre = pickOne(genres, random);
    return [genre, pickOne(Object.keys(catalog[genre].styles), random)];
}

/** A DJ's folk style of home: one of `homes` that exists in the catalog, or null when none does. */
export function pickHomeStyle(catalog: StyleCatalog, homes: [string, string][], random: () => number = Math.random): [string, string] | null {
    const valid = homes.filter(([g, st]) => !!catalog[g]?.styles[st]);
    return valid.length ? pickOne(valid, random) : null;
}
