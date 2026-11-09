/**
 * Typed custom events. A component lists the events it sends and their detail in an `XxxEvents` interface and
 * declares it with `declare readonly __events?: XxxEvents` (a type only, nothing at runtime). `on()` then accepts
 * only those event names on that component and types the handler's `e.detail`, so listening on the wrong component
 * or for a misspelled event does not compile. (tests/events.test.ts checks every listed event is really sent.)
 */

/** Events without a detail */
export type NoDetail = undefined;

/** The event map a component declares */
export type EventsOf<T> = T extends { readonly __events?: infer M } ? NonNullable<M> : never;

/** Listen for one of the target's own events; returns a function that stops listening. */
export function on<T extends EventTarget & { readonly __events?: object }, K extends keyof EventsOf<T> & string>(
    target: T,
    type: K,
    handler: (e: CustomEvent<EventsOf<T>[K]>) => void | Promise<void>,
): () => void {
    const listener = handler as unknown as EventListener;
    target.addEventListener(type, listener);
    return () => target.removeEventListener(type, listener);
}
