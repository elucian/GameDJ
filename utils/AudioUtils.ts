/**
 * SlewLimiter
 * Smooths parameter changes over time.
 */
export class SlewLimiter {
    private value: number;
    private target: number;
    private tau: number; // Time constant (seconds)

    constructor(initialValue: number, tau: number = 0.5) {
        this.value = initialValue;
        this.target = initialValue;
        this.tau = tau;
    }

    setTarget(target: number) {
        this.target = target;
    }

    process(deltaTime: number): number {
        // Simple exponential smoothing: y(n) = y(n-1) + (target - y(n-1)) * (1 - e^(-dt/tau))
        const alpha = 1 - Math.exp(-deltaTime / this.tau);
        this.value += (this.target - this.value) * alpha;
        return this.value;
    }
}

/**
 * MicroDriftEngine
 * Adds subtle variations to prevent stagnation.
 */
export class MicroDriftEngine {
    private seed: number;

    constructor() {
        this.seed = Math.random() * 1000;
    }

    getDrift(time: number, amplitude: number = 0.05): number {
        // Use time to generate subtle Perlin-like oscillation
        return Math.sin(time * 0.5 + this.seed) * amplitude;
    }
}
