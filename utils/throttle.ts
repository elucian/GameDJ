/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Throttles a callback to be called at most once per `delay` milliseconds.
 * The first call runs immediately; calls made during the wait are merged into one trailing call at the end of
 * the window, so the latest state is always sent (dropping them left values such as guidance stuck).
 */
export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let lastCall = -Infinity;
  let lastResult: ReturnType<T> | undefined;
  let pending: number | null = null;
  let pendingArgs: Parameters<T> | null = null;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    if (timeSinceLastCall >= delay) {
      if (pending !== null) { clearTimeout(pending); pending = null; }
      lastResult = func(...args);
      lastCall = now;
    } else {
      pendingArgs = args;
      if (pending === null) {
        pending = window.setTimeout(() => {
          pending = null;
          lastCall = Date.now();
          if (pendingArgs) lastResult = func(...pendingArgs);
          pendingArgs = null;
        }, delay - timeSinceLastCall);
      }
    }
    return lastResult;
  };
}
