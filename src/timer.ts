import { Duration } from "./duration.js";
import { Time, now } from "./time.js";

/**
 * A buffered async channel that delivers {@link Time} values to consumers.
 *
 * Producers call {@link push} and consumers `await` {@link recv} or iterate
 * with `for await...of`. When the queue is full (at `capacity`) new values are
 * silently dropped, matching the behavior of Go's buffered channels.
 */
export class TimeChannel implements AsyncIterable<Time> {
  private readonly queue: Time[] = [];
  private readonly waiters: Array<(value: Time) => void> = [];
  private readonly capacity: number;

  /**
   * @param capacity - Maximum number of queued values before new ones are
   *   dropped. Defaults to `Number.POSITIVE_INFINITY` (unbounded).
   */
  constructor(capacity = Number.POSITIVE_INFINITY) {
    this.capacity = capacity;
  }

  /**
   * Delivers a value to the next waiting consumer, or enqueues it.
   * Silently discards the value if the queue is at capacity.
   *
   * @param value - The time value to deliver.
   */
  push(value: Time): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(value);
      return;
    }

    if (this.queue.length >= this.capacity) {
      return;
    }

    this.queue.push(value);
  }

  /**
   * Returns a promise that resolves with the next time value. Awaits
   * indefinitely if the queue is empty.
   */
  recv(): Promise<Time> {
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      if (!value) {
        throw new Error("unexpected empty channel queue");
      }
      return Promise.resolve(value);
    }

    return new Promise<Time>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<Time> {
    return {
      next: async () => ({ done: false, value: await this.recv() })
    };
  }
}

/**
 * A one-shot timer that fires after a duration `d` has elapsed.
 *
 * When the timer fires it either sends the current time on {@link C} (the
 * default), or calls an optional callback.
 *
 * @example
 * ```ts
 * const timer = new Timer(parseDuration("1s"));
 * const t = await timer.C.recv();
 * console.log("fired at", t.toString());
 * ```
 */
export class Timer {
  private timeout: NodeJS.Timeout | null;
  private readonly callback: (() => void) | undefined;
  private fired = false;
  /** The channel on which the timer sends the fire time (capacity 1). */
  readonly C: TimeChannel;

  /**
   * @param d - Duration after which the timer fires.
   * @param callback - Optional function to call instead of sending to {@link C}.
   */
  constructor(d: Duration, callback?: () => void) {
    this.callback = callback;
    this.C = new TimeChannel(1);

    this.timeout = this.schedule(d);
  }

  /**
   * Stops the timer, preventing it from firing. Returns `true` if the timer
   * was stopped before it fired, `false` if it had already fired.
   */
  stop(): boolean {
    if (!this.timeout) {
      return false;
    }

    clearTimeout(this.timeout);
    this.timeout = null;
    return !this.fired;
  }

  /**
   * Resets the timer to fire after duration `d`. Returns `true` if the timer
   * was active before the reset, `false` if it had already fired or been
   * stopped.
   *
   * @param d - The new duration.
   */
  reset(d: Duration): boolean {
    const wasActive = this.stop();
    this.fired = false;
    this.timeout = this.schedule(d);
    return wasActive;
  }

  private schedule(d: Duration): NodeJS.Timeout {
    const ms = Number(d.milliseconds());
    const delay = Math.max(0, ms);
    return setTimeout(() => {
      this.fired = true;
      this.timeout = null;
      if (this.callback) {
        this.callback();
      } else {
        this.C.push(now());
      }
    }, delay);
  }
}

/**
 * A repeating timer that sends the current time on {@link C} after every
 * duration `d`.
 *
 * @example
 * ```ts
 * const ticker = new Ticker(parseDuration("500ms"));
 * for await (const t of ticker) {
 *   console.log("tick", t.toString());
 *   ticker.stop();
 *   break;
 * }
 * ```
 */
export class Ticker {
  private interval: NodeJS.Timeout | null;
  /** The channel on which the ticker sends fire times (capacity 1). */
  readonly C: TimeChannel;

  /**
   * @param d - Interval between ticks. Must be positive.
   * @throws {Error} If `d` is zero or negative.
   */
  constructor(d: Duration) {
    this.C = new TimeChannel(1);
    const ms = Number(d.milliseconds());
    if (ms <= 0) {
      throw new Error("non-positive interval for new ticker");
    }

    this.interval = setInterval(() => {
      this.C.push(now());
    }, ms);
  }

  /** Stops the ticker so it will no longer send times. */
  stop(): void {
    if (!this.interval) {
      return;
    }
    clearInterval(this.interval);
    this.interval = null;
  }

  /**
   * Resets the ticker interval to `d`.
   *
   * @param d - The new interval. Must be positive.
   * @throws {Error} If `d` is zero or negative.
   */
  reset(d: Duration): void {
    this.stop();
    const ms = Number(d.milliseconds());
    if (ms <= 0) {
      throw new Error("non-positive interval for ticker reset");
    }

    this.interval = setInterval(() => {
      this.C.push(now());
    }, ms);
  }

  [Symbol.asyncIterator](): AsyncIterator<Time> {
    return this.C[Symbol.asyncIterator]();
  }
}

/**
 * Returns a promise that resolves with the current time after duration `d`.
 *
 * @param d - How long to wait.
 */
export function after(d: Duration): Promise<Time> {
  return new Timer(d).C.recv();
}

/**
 * Returns a {@link Timer} that calls `f` after duration `d`.
 *
 * @param d - How long to wait.
 * @param f - Function to invoke when the timer fires.
 */
export function afterFunc(d: Duration, f: () => void): Timer {
  return new Timer(d, f);
}

/**
 * Creates and returns a new {@link Timer} that fires after duration `d`.
 *
 * @param d - How long to wait.
 */
export function newTimer(d: Duration): Timer {
  return new Timer(d);
}

/**
 * Creates and returns a new {@link Ticker} with interval `d`.
 *
 * @param d - Tick interval. Must be positive.
 * @throws {Error} If `d` is zero or negative.
 */
export function newTicker(d: Duration): Ticker {
  return new Ticker(d);
}

export function tick(d: Duration): AsyncIterable<Time> | null {
  if (d.milliseconds() <= 0n) {
    return null;
  }

  const ticker = newTicker(d);
  (ticker as unknown as { interval: NodeJS.Timeout | null }).interval?.unref?.();
  return ticker.C;
}
