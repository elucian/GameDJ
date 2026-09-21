/**
 * MacroEngine
 * Maps 4 Macro controls to the 18 micro-parameters for Lyria.
 */

export interface Macros {
    energy: number;      // 0.0 - 1.0
    timbreSpace: number; // 0.0 - 1.0
    expressiveness: number; // 0.0 - 1.0
    guidance: number;    // 0.0 - 1.0
}

export const MACRO_MAPPING = {
    // Energy drives: Density, Dynamics, Attack, Presence
    energy: {
        'Density': 1.0,
        'Dynamics': 0.8,
        'Attack': 0.6,
        'Presence': 0.5
    },
    // Timbre & Space: Brightness, Texture, Atmosphere, Space, Width
    timbreSpace: {
        'Brightness': 0.8,
        'Texture': 0.7,
        'Atmosphere': 0.9,
        'Space': 0.7,
        'Width': 0.6
    },
    // Expressiveness: Glide, Ornamentation, Staccato, Groove
    expressiveness: {
        'Glide': 0.7,
        'Ornamentation': 0.9,
        'Staccato': 0.6,
        'Groove': 0.5
    },
    // Guidance: Guidance, Complexity
    guidance: {
        'Guidance': 1.0,
        'Complexity': 0.8
    }
};

export class MacroEngine {
    static mapMacrosToMicro(macros: Macros): Record<string, number> {
        const result: Record<string, number> = {};
        
        // Accumulate values
        const accumulate = (map: Record<string, number>, weight: number) => {
            for (const [param, factor] of Object.entries(map)) {
                result[param] = (result[param] || 0) + (factor * weight);
            }
        };

        accumulate(MACRO_MAPPING.energy, macros.energy);
        accumulate(MACRO_MAPPING.timbreSpace, macros.timbreSpace);
        accumulate(MACRO_MAPPING.expressiveness, macros.expressiveness);
        accumulate(MACRO_MAPPING.guidance, macros.guidance);

        return result;
    }
}
