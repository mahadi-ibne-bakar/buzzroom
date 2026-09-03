/**
 * Simple sliding-window rate limiter, one instance per socket connection.
 *
 * Why per-socket and not per-IP?
 * Per-IP limiting requires parsing X-Forwarded-For headers carefully to
 * avoid being fooled by proxy chains — complexity we don't need yet.
 * Per-socket is simpler, and since each socket is a separate TCP
 * connection, it's still an effective brake on misbehaving clients.
 */
export class SocketRateLimiter {
  // event name → array of timestamps when that event was received
  private readonly counts = new Map<string, number[]>();

  /**
   * Returns true if the event is within limits, false if it should be
   * rejected. Call this before processing any socket event.
   *
   * @param event     The socket event name
   * @param maxCount  Maximum allowed occurrences within the window
   * @param windowMs  The rolling window duration in milliseconds
   */
  check(event: string, maxCount: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = this.counts.get(event) ?? [];

    // Drop timestamps that have fallen outside the current window
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= maxCount) {
      // Update to drop the stale timestamps even on a rejection
      this.counts.set(event, recent);
      return false;
    }

    recent.push(now);
    this.counts.set(event, recent);
    return true;
  }
}
