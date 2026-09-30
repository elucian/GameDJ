You are acting as a Senior Web Audio & AI Systems Architect. Your task is to refactor the Lyria GameDJ engine and frontend UI according to the technical requirements in `lyria_gamedj_architecture_spec.md`.

### Core Goals:
1. Eliminate audio degradation caused by latent vector collisions (18 parameter conflict).
2. Fix parameter update pops/artifacts via beat-quantization and slew-rate smoothing.
3. Solve musical monotony using an anti-stagnation micro-drift engine.
4. Simplify the UI by replacing the 18-knob layout with 4 core Macro controls, Stem Mute/Solo gates, Snapshot presets, and a 4-bar Loop Lock.

---

### Step-by-Step Implementation Task List:

#### Phase 1: Middleware & Parameter Transformation (`MacroEngine`)
- [ ] Create/update `MacroEngine`: Map 4 input macro vectors `[Energy, Timbre, Expressiveness, Guidance]` to the 18 underlying Lyria parameters using the transfer matrix and curves specified in Section 2.2 of the spec.
- [ ] Implement `AntiStagnationEngine`: Add subtle 1D Perlin noise / LFO micro-drift ($\pm 1-5\%$) to volatile parameters (*Variation*, *Ornamentation*, *Texture*) to maintain organic musical progression when controls are idle.

#### Phase 2: Timing, Quantization & Smoothing (`AudioScheduler`)
- [ ] Implement `QuantizedScheduler`: Sync parameter update latches to $1$-bar, $4$-bar, or $8$-bar downbeats locked to the 126 BPM master audio clock.
- [ ] Implement `SlewFilter`: Apply a first-order low-pass filter ($\tau = 0.5\text{s} \dots 2.0\text{s}$) to smooth output parameters fed into the real-time Lyria API stream.

#### Phase 3: Frontend Layout & Performance Controls (`GameDJ UI`)
- [ ] Replace 18 continuous micro-knobs on the primary dashboard with 4 Macro Knobs:
  - **Energy** (Density, Dynamics, Attack, Presence)
  - **Timbre & Space** (Brightness, Texture, Atmosphere, Space, Width)
  - **Expressiveness** (Glide, Ornamentation, Staccato, Groove)
  - **Structural Guidance** (Guidance, Complexity)
- [ ] Implement Channel Stem Gates: Quantized Mute and Solo switches for Orchestra, Solo, Choir, Brass, and Drums.
- [ ] Add Performance Snapshot Buttons: `[Intro]`, `[Build-Up]`, `[Main Drop]`, `[Breakdown]`, `[Outro]`.
- [ ] Add `Loop Lock (4-Bar)` Toggle: Buffer live output to a local ring-buffer loop while active, allowing background parameter adjustment without disrupting the audio stream.

---

### Definition of Done:
- All 18 micro-parameters move smoothly without abrupt step-changes.
- Parameter updates execute strictly on musical bar boundaries.
- The UI displays 4 primary macro knobs instead of 18 individual knobs.
- Continuous play with static macro knobs remains dynamic and varied without looping indefinitely into local attractors.
