
// Simulation of the fix
const isVocalInstrument = (inst: string) => inst.includes('Voice') || inst.includes('Choir');

function randomizeInstrumentsSimulated(pool: string[], mode: string) {
    let candidates = pool;
    if (mode !== 'VOCALIZATION') {
        candidates = pool.filter(inst => !isVocalInstrument(inst));
    }
    
    if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    } else if (pool.length > 0) {
        // This is the FIX
        return pool[Math.floor(Math.random() * pool.length)];
    } else {
        return "";
    }
}

// Test case: Vocal-only pool
const pool = ["Female Voice", "Choir"];
const result = randomizeInstrumentsSimulated(pool, 'QUALITY');

console.log("Pool:", pool);
console.log("Result:", result);

if (result !== "") {
    console.log("SUCCESS: Fix works. Instrument found.");
} else {
    console.log("FAILURE: Fix failed. Channel is empty.");
}
