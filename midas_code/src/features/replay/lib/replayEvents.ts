// src/features/replay/lib/replayEvents.ts
//
// Tiny typed event bus shared by the replay scheduler (publisher) and the
// chart + diagnostics overlay (subscribers). No external deps so it stays
// framework-agnostic and easy to reason about.
//
// Contract (do not change without updating useReplayScheduler / ReplayChart /
// ReplayDiagnosticsOverlay, which all import from here):
//   - emitReplayEvent(event)            -> publish to all matching listeners
//   - onReplayEvent(type, handler)      -> subscribe; returns an unsubscribe fn
//   - onAnyReplayEvent(handler)         -> subscribe to every event type

export type ReplayEventType =
  | 'replay:play'
  | 'replay:pause'
  | 'replay:step'
  | 'replay:seek'
  | 'replay:reset'
  | 'replay:finish'
  | 'replay:bar-open'
  | 'replay:bar-close'
  | 'replay:intrabar-tick'
  | 'replay:signal'
  | 'replay:entry'
  | 'replay:exit'
  | 'replay:alert'

export type ReplaySeverity = 'info' | 'warn' | 'error' | 'success'

export type ReplayEventPayload = {
  /** Index of the bar this event belongs to (0-based). Always present. */
  barIndex: number
  /** Sub-bar tick index when in intrabar/hybrid mode. */
  tickIndex?: number
  /** Epoch ms when the event was emitted. */
  timestamp?: number
  /** Price associated with the event (entry/exit/signal level). */
  price?: number
  /** Human-readable label shown in diagnostics. */
  label?: string
  /** Overrides the default diagnostic severity for this event. */
  severity?: ReplaySeverity
  /** Free-form structured data (e.g. { slippageDelta, parity, side }). */
  data?: Record<string, unknown>
}

export type ReplayEvent = {
  type: ReplayEventType
  payload: ReplayEventPayload
}

export type ReplayEventHandler = (event: ReplayEvent) => void

/** Unsubscribe handle returned by every subscription call. */
export type Unsubscribe = () => void

// Per-type listener registry plus a wildcard bucket.
const listeners = new Map<ReplayEventType, Set<ReplayEventHandler>>()
const wildcard = new Set<ReplayEventHandler>()

/**
 * Subscribe to a single event type. Returns a function that removes the
 * listener — callers collect these in an array and call them on cleanup.
 */
export function onReplayEvent(
  type: ReplayEventType,
  handler: ReplayEventHandler
): Unsubscribe {
  let set = listeners.get(type)
  if (!set) {
    set = new Set()
    listeners.set(type, set)
  }
  set.add(handler)
  return () => {
    set?.delete(handler)
  }
}

/** Subscribe to every event type. Returns an unsubscribe function. */
export function onAnyReplayEvent(handler: ReplayEventHandler): Unsubscribe {
  wildcard.add(handler)
  return () => {
    wildcard.delete(handler)
  }
}

/**
 * Publish an event to all matching listeners. Handlers are isolated so a throw
 * in one subscriber never blocks the rest (important: the scheduler emits on a
 * rAF loop and must not be derailed by a buggy overlay handler).
 */
export function emitReplayEvent(event: ReplayEvent): void {
  const typed = listeners.get(event.type)
  if (typed) {
    for (const handler of typed) safeCall(handler, event)
  }
  for (const handler of wildcard) safeCall(handler, event)
}

function safeCall(handler: ReplayEventHandler, event: ReplayEvent): void {
  try {
    handler(event)
  } catch (err) {
    // Never let a subscriber error break replay playback.
    // eslint-disable-next-line no-console
    console.error(`[replayEvents] handler for "${event.type}" threw:`, err)
  }
}

/** Remove every listener. Useful in tests and full teardown. */
export function clearReplayListeners(): void {
  listeners.clear()
  wildcard.clear()
}
