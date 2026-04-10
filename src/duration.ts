const MILLISECONDS_PER_SECOND = 1_000n;
const MILLISECONDS_PER_MINUTE = 60n * MILLISECONDS_PER_SECOND;
const MILLISECONDS_PER_HOUR = 60n * MILLISECONDS_PER_MINUTE;

/** One millisecond, the base unit of {@link Duration}. */
export const Millisecond = 1n;
/** One second (1,000 milliseconds). */
export const Second = MILLISECONDS_PER_SECOND;
/** One minute (60 seconds). */
export const Minute = MILLISECONDS_PER_MINUTE;
/** One hour (60 minutes). */
export const Hour = MILLISECONDS_PER_HOUR;

/** Accepted duration input for APIs that support raw millisecond values. */
export type DurationInput = Duration | bigint;

type DurationUnit = {
  suffix: string;
  factor: bigint;
};

const UNIT_TABLE: DurationUnit[] = [
  { suffix: "h", factor: Hour },
  { suffix: "m", factor: Minute },
  { suffix: "s", factor: Second },
  { suffix: "ms", factor: Millisecond },
];

/**
 * A span of time with millisecond precision, represented internally as a
 * signed `bigint` number of milliseconds.
 *
 * @example
 * ```ts
 * const d = new Duration(5n * Second);
 * console.log(d.seconds()); // 5
 * console.log(d.toString()); // "5s"
 * ```
 */
export class Duration {
  private readonly ms: bigint;

  /**
   * @param milliseconds - The duration in milliseconds. Use the exported unit
   *   constants (`Second`, `Minute`, etc.) to construct common values.
   */
  constructor(milliseconds: bigint) {
    this.ms = milliseconds;
  }

  /** Returns the duration truncated to whole milliseconds. */
  milliseconds(): bigint {
    return this.ms;
  }

  /** Returns the duration as a floating-point number of seconds. */
  seconds(): number {
    return Number(this.ms) / Number(MILLISECONDS_PER_SECOND);
  }

  /** Returns the duration as a floating-point number of minutes. */
  minutes(): number {
    return Number(this.ms) / Number(MILLISECONDS_PER_MINUTE);
  }

  /** Returns the duration as a floating-point number of hours. */
  hours(): number {
    return Number(this.ms) / Number(MILLISECONDS_PER_HOUR);
  }

  /** Returns the absolute value of the duration. */
  abs(): Duration {
    return this.ms < 0n ? new Duration(-this.ms) : this;
  }

  /**
   * Returns the result of rounding the duration to the nearest multiple of `m`.
   * Ties are rounded away from zero. If `m` is zero or negative, the duration
   * is returned unchanged.
   *
   * @param m - The rounding unit.
   */
  round(m: Duration): Duration {
    const mod = m.milliseconds();
    if (mod <= 0n) {
      return this;
    }

    const n = this.ms;
    const rem = n % mod;
    if (rem === 0n) {
      return this;
    }

    const half = mod / 2n;
    const absRem = rem < 0n ? -rem : rem;
    const up = absRem >= half;

    if (!up) {
      return new Duration(n - rem);
    }

    return new Duration(n >= 0n ? n + (mod - rem) : n - (mod + rem));
  }

  /**
   * Returns the result of rounding the duration toward zero to a multiple of
   * `m`. If `m` is zero or negative, the duration is returned unchanged.
   *
   * @param m - The truncation unit.
   */
  truncate(m: Duration): Duration {
    const mod = m.milliseconds();
    if (mod <= 0n) {
      return this;
    }
    return new Duration(this.ms - (this.ms % mod));
  }

  /**
   * Returns a human-readable string representation using the shortest
   * combination of units necessary, e.g. `"1h30m5s"`, `"200ms"`, `"0s"`.
   */
  toString(): string {
    if (this.ms === 0n) {
      return "0s";
    }

    const sign = this.ms < 0n ? "-" : "";
    let rem = this.ms < 0n ? -this.ms : this.ms;

    if (rem < Second) {
      return sign + `${rem}ms`;
    }

    const hours = rem / Hour;
    rem %= Hour;
    const minutes = rem / Minute;
    rem %= Minute;
    const seconds = rem / Second;
    const milliseconds = rem % Second;

    let out = sign;
    if (hours > 0n) {
      out += `${hours}h`;
    }
    if (minutes > 0n) {
      out += `${minutes}m`;
    }

    if (milliseconds === 0n) {
      out += `${seconds}s`;
      return out;
    }

    const frac = milliseconds.toString().padStart(3, "0").replace(/0+$/, "");
    out += `${seconds}.${frac}s`;
    return out;
  }
}

/**
 * Parses a duration string and returns a {@link Duration}.
 *
 * A duration string is a possibly-signed sequence of decimal numbers, each
 * with an optional fraction and a unit suffix: `"300ms"`, `"1.5h"`, `"-2h45m"`.
 * Valid units are `"ms"`, `"s"`, `"m"`, and `"h"`.
 *
 * @param input - The string to parse.
 * @returns The parsed {@link Duration}.
 * @throws {Error} If the string is empty, has an invalid format, or contains an
 *   unknown unit.
 *
 * @example
 * ```ts
 * parseDuration("1h30m").hours();  // 1.5
 * parseDuration("500ms").milliseconds(); // 500n
 * ```
 */
export function parseDuration(input: string): Duration {
  const s = input.trim();
  if (s.length === 0) {
    throw new Error("invalid duration: empty string");
  }

  let i = 0;
  let sign = 1n;
  if (s[i] === "+") {
    i += 1;
  } else if (s[i] === "-") {
    sign = -1n;
    i += 1;
  }

  if (i >= s.length) {
    throw new Error(`invalid duration: ${input}`);
  }

  let total = 0n;
  while (i < s.length) {
    const numStart = i;
    while (i < s.length && isDigit(s[i])) {
      i += 1;
    }

    let fraction = "";
    if (i < s.length && s[i] === ".") {
      i += 1;
      const fracStart = i;
      while (i < s.length && isDigit(s[i])) {
        i += 1;
      }
      if (i === fracStart && numStart === fracStart - 1) {
        throw new Error(`invalid duration: ${input}`);
      }
      fraction = s.slice(fracStart, i);
    }

    if (numStart === i || (numStart + 1 === i && s[numStart] === ".")) {
      throw new Error(`invalid duration: ${input}`);
    }

    const number = s.slice(numStart, fraction ? i - (fraction.length + 1) : i);
    const unitStart = i;
    while (i < s.length && /[a-zA-Zµ]/.test(s[i] ?? "")) {
      i += 1;
    }

    if (unitStart === i) {
      throw new Error(`missing unit in duration: ${input}`);
    }

    const unit = s.slice(unitStart, i);
    const entry = UNIT_TABLE.find((u) => u.suffix === unit);
    if (!entry) {
      throw new Error(`unknown unit ${unit} in duration: ${input}`);
    }

    const whole = number.length > 0 ? BigInt(number) : 0n;
    let ms = whole * entry.factor;
    if (fraction.length > 0) {
      const scale = 10n ** BigInt(fraction.length);
      ms += (BigInt(fraction) * entry.factor) / scale;
    }

    total += ms;
  }

  return new Duration(total * sign);
}

function isDigit(ch: string | undefined): ch is string {
  return typeof ch === "string" && ch >= "0" && ch <= "9";
}
