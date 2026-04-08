const NS_PER_US = 1_000n;
const NS_PER_MS = 1_000_000n;
const NS_PER_S = 1_000_000_000n;
const NS_PER_M = 60n * NS_PER_S;
const NS_PER_H = 60n * NS_PER_M;

/** One nanosecond, the base unit of {@link Duration}. */
export const Nanosecond = 1n;
/** One microsecond (1,000 nanoseconds). */
export const Microsecond = NS_PER_US;
/** One millisecond (1,000,000 nanoseconds). */
export const Millisecond = NS_PER_MS;
/** One second (1,000,000,000 nanoseconds). */
export const Second = NS_PER_S;
/** One minute (60 seconds). */
export const Minute = NS_PER_M;
/** One hour (60 minutes). */
export const Hour = NS_PER_H;

type DurationUnit = {
  suffix: string;
  factor: bigint;
};

const UNIT_TABLE: DurationUnit[] = [
  { suffix: "h", factor: Hour },
  { suffix: "m", factor: Minute },
  { suffix: "s", factor: Second },
  { suffix: "ms", factor: Millisecond },
  { suffix: "us", factor: Microsecond },
  { suffix: "µs", factor: Microsecond },
  { suffix: "ns", factor: Nanosecond }
];

/**
 * A span of time with nanosecond precision, represented internally as a
 * signed `bigint` number of nanoseconds.
 *
 * @example
 * ```ts
 * const d = new Duration(5n * Second);
 * console.log(d.seconds()); // 5
 * console.log(d.toString()); // "5s"
 * ```
 */
export class Duration {
  private readonly ns: bigint;

  /**
   * @param nanoseconds - The duration in nanoseconds. Use the exported unit
   *   constants (`Second`, `Minute`, etc.) to construct common values.
   */
  constructor(nanoseconds: bigint) {
    this.ns = nanoseconds;
  }

  /** Returns the duration as a whole number of nanoseconds. */
  nanoseconds(): bigint {
    return this.ns;
  }

  /** Returns the duration truncated to whole microseconds. */
  microseconds(): bigint {
    return this.ns / NS_PER_US;
  }

  /** Returns the duration truncated to whole milliseconds. */
  milliseconds(): bigint {
    return this.ns / NS_PER_MS;
  }

  /** Returns the duration as a floating-point number of seconds. */
  seconds(): number {
    return Number(this.ns) / Number(NS_PER_S);
  }

  /** Returns the duration as a floating-point number of minutes. */
  minutes(): number {
    return Number(this.ns) / Number(NS_PER_M);
  }

  /** Returns the duration as a floating-point number of hours. */
  hours(): number {
    return Number(this.ns) / Number(NS_PER_H);
  }

  /** Returns the absolute value of the duration. */
  abs(): Duration {
    return this.ns < 0n ? new Duration(-this.ns) : this;
  }

  /**
   * Returns the result of rounding the duration to the nearest multiple of `m`.
   * Ties are rounded away from zero. If `m` is zero or negative, the duration
   * is returned unchanged.
   *
   * @param m - The rounding unit.
   */
  round(m: Duration): Duration {
    const mod = m.nanoseconds();
    if (mod <= 0n) {
      return this;
    }

    const n = this.ns;
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
    const mod = m.nanoseconds();
    if (mod <= 0n) {
      return this;
    }
    return new Duration(this.ns - (this.ns % mod));
  }

  /**
   * Returns a human-readable string representation using the shortest
   * combination of units necessary, e.g. `"1h30m5s"`, `"200ms"`, `"0s"`.
   */
  toString(): string {
    if (this.ns === 0n) {
      return "0s";
    }

    const sign = this.ns < 0n ? "-" : "";
    let rem = this.ns < 0n ? -this.ns : this.ns;

    if (rem < Second) {
      if (rem >= Millisecond) {
        return sign + formatSubsecond(rem, Millisecond, "ms");
      }
      if (rem >= Microsecond) {
        return sign + formatSubsecond(rem, Microsecond, "us");
      }
      return sign + `${rem}ns`;
    }

    const hours = rem / Hour;
    rem %= Hour;
    const minutes = rem / Minute;
    rem %= Minute;
    const seconds = rem / Second;
    const nanos = rem % Second;

    let out = sign;
    if (hours > 0n) {
      out += `${hours}h`;
    }
    if (minutes > 0n) {
      out += `${minutes}m`;
    }

    if (nanos === 0n) {
      out += `${seconds}s`;
      return out;
    }

    const frac = nanos.toString().padStart(9, "0").replace(/0+$/, "");
    out += `${seconds}.${frac}s`;
    return out;
  }
}

function formatSubsecond(value: bigint, unit: bigint, suffix: string): string {
  const whole = value / unit;
  const rem = value % unit;

  if (rem === 0n) {
    return `${whole}${suffix}`;
  }

  const digits = unit === Millisecond ? 6 : 3;
  const frac = rem.toString().padStart(digits, "0").replace(/0+$/, "");
  return `${whole}.${frac}${suffix}`;
}

/**
 * Parses a duration string and returns a {@link Duration}.
 *
 * A duration string is a possibly-signed sequence of decimal numbers, each
 * with an optional fraction and a unit suffix: `"300ms"`, `"1.5h"`, `"-2h45m"`.
 * Valid units are `"ns"`, `"us"` (or `"µs"`), `"ms"`, `"s"`, `"m"`, and `"h"`.
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
    let ns = whole * entry.factor;
    if (fraction.length > 0) {
      const scale = 10n ** BigInt(fraction.length);
      ns += (BigInt(fraction) * entry.factor) / scale;
    }

    total += ns;
  }

  return new Duration(total * sign);
}

function isDigit(ch: string | undefined): ch is string {
  return typeof ch === "string" && ch >= "0" && ch <= "9";
}
