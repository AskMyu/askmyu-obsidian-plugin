/**
 * One refresh at a time, and never two closer than the gap — unless the
 * person asked. Callers keep saying "refresh" as often as they like; the pane
 * fetches at most once per gap, and once more for whatever arrived while it
 * was fetching. (2026-09-03: every progress line of a vault sync refreshed
 * the Today pane — six calls each, ~700 times in two minutes — and tripped
 * the backend's tier and then the WAF for the whole IP.)
 */
export class RefreshGate {
  private inFlight: Promise<void> | null = null;
  private dirty = false;
  private urgent = false;
  private last = 0;
  /** How many runs actually happened — the test's fingerprint. */
  runs = 0;

  constructor(
    private run: () => Promise<void>,
    private gapMs: number,
    private timers: { now: () => number; sleep: (ms: number) => Promise<void> } = {
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => window.setTimeout(r, ms)),
    },
  ) {}

  /** Ask. `now` is the person's own hand — no gap for them. */
  request(opts: { now?: boolean } = {}): Promise<void> {
    if (opts.now) this.urgent = true;
    if (this.inFlight) {
      this.dirty = true;
      return this.inFlight;
    }
    this.inFlight = (async () => {
      let wait = this.urgent ? 0 : Math.max(0, this.last + this.gapMs - this.timers.now());
      do {
        if (wait > 0) await this.timers.sleep(wait);
        this.dirty = false;
        this.urgent = false;
        this.last = this.timers.now();
        this.runs += 1;
        try {
          await this.run();
        } catch {
          // The pane reports its own failures; the gate only paces.
        }
        wait = this.urgent ? 0 : this.gapMs;
      } while (this.dirty);
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  get pending(): boolean {
    return this.inFlight !== null;
  }
}
