import { performance } from "node:perf_hooks";
import {
  ANSIC,
  DateOnly,
  DateTime,
  Kitchen,
  RFC822,
  RFC822Z,
  RFC850,
  RFC1123,
  RFC1123Z,
  RFC3339,
  RFC3339Nano,
  RubyDate,
  Stamp,
  StampMicro,
  StampMilli,
  StampNano,
  TimeOnly,
  UnixDate
} from "./layout.js";
import { Duration } from "./duration.js";
import { Local, Location, UTC } from "./location.js";

const NS_PER_MS = 1_000_000n;
const NS_PER_S = 1_000_000_000n;

/** Represents a calendar month (January = 1 … December = 12). */
export enum Month {
  January = 1,
  February,
  March,
  April,
  May,
  June,
  July,
  August,
  September,
  October,
  November,
  December
}

/** Represents a day of the week (Sunday = 0 … Saturday = 6). */
export enum Weekday {
  Sunday = 0,
  Monday,
  Tuesday,
  Wednesday,
  Thursday,
  Friday,
  Saturday
}

/**
 * An immutable point in time with nanosecond precision.
 *
 * Internally the value is stored as a signed 64-bit integer of nanoseconds
 * since the Unix epoch (UTC). An optional monotonic clock reading is captured
 * by {@link now} and used by {@link sub} for accurate elapsed-time
 * measurements that are unaffected by wall-clock adjustments.
 *
 * @example
 * ```ts
 * const t = now();
 * // ... some work ...
 * const elapsed = now().sub(t);
 * console.log(elapsed.toString()); // e.g. "42ms"
 * ```
 */
export class Time {
  private readonly epochNs: bigint;
  private readonly loc: Location;
  private readonly monotonicNs: bigint | undefined;

  constructor(epochNs: bigint, loc: Location = UTC, monotonicNs?: bigint) {
    this.epochNs = epochNs;
    this.loc = loc;
    this.monotonicNs = monotonicNs;
  }

  /**
   * Returns the time `t + d`.
   *
   * @param d - The duration to add. Negative values move the time backward.
   */
  add(d: Duration): Time {
    return new Time(this.epochNs + d.nanoseconds(), this.loc, this.monotonicNs);
  }

  /**
   * Returns the duration `t - u`.
   *
   * If both times carry a monotonic clock reading, the result is based on the
   * monotonic difference to avoid sensitivity to wall-clock changes.
   *
   * @param other - The time to subtract.
   */
  sub(other: Time): Duration {
    if (this.monotonicNs !== undefined && other.monotonicNs !== undefined) {
      return new Duration(this.monotonicNs - other.monotonicNs);
    }
    return new Duration(this.epochNs - other.epochNs);
  }

  /**
   * Compares this time with `other`.
   *
   * @returns `-1` if `t < other`, `0` if `t == other`, `1` if `t > other`.
   */
  compare(other: Time): number {
    const diff = this.sub(other).nanoseconds();
    if (diff < 0n) {
      return -1;
    }
    if (diff > 0n) {
      return 1;
    }
    return 0;
  }

  /** Returns `true` if `t` is before `other`. */
  before(other: Time): boolean {
    return this.compare(other) < 0;
  }

  /** Returns `true` if `t` is after `other`. */
  after(other: Time): boolean {
    return this.compare(other) > 0;
  }

  /** Returns `true` if `t` and `other` represent the same instant. */
  equal(other: Time): boolean {
    return this.compare(other) === 0;
  }

  /** Returns the Unix timestamp in whole seconds. */
  unix(): bigint {
    return this.epochNs / NS_PER_S;
  }

  /** Returns the Unix timestamp in whole milliseconds. */
  unixMilli(): bigint {
    return this.epochNs / NS_PER_MS;
  }

  /** Returns the Unix timestamp in whole microseconds. */
  unixMicro(): bigint {
    return this.epochNs / 1_000n;
  }

  /** Returns the Unix timestamp in nanoseconds. */
  unixNano(): bigint {
    return this.epochNs;
  }

  /**
   * Returns the result of rounding `t` down to a multiple of `d` since the
   * Unix epoch. If `d` is zero or negative, `t` is returned unchanged.
   *
   * @param d - The truncation unit.
   */
  truncate(d: Duration): Time {
    const step = d.nanoseconds();
    if (step <= 0n) {
      return this;
    }

    return new Time((this.epochNs / step) * step, this.loc);
  }

  /**
   * Returns the result of rounding `t` to the nearest multiple of `d` since
   * the Unix epoch. Ties round up. If `d` is zero or negative, `t` is returned
   * unchanged.
   *
   * @param d - The rounding unit.
   */
  round(d: Duration): Time {
    const step = d.nanoseconds();
    if (step <= 0n) {
      return this;
    }

    const rem = this.epochNs % step;
    if (rem === 0n) {
      return this;
    }

    const absRem = rem < 0n ? -rem : rem;
    if (absRem * 2n < step) {
      return new Time(this.epochNs - rem, this.loc);
    }

    if (this.epochNs >= 0n) {
      return new Time(this.epochNs + (step - rem), this.loc);
    }

    return new Time(this.epochNs - (step + rem), this.loc);
  }

  /** Returns the {@link Location} associated with `t`. */
  location(): Location {
    return this.loc;
  }

  /**
   * Returns a copy of `t` interpreted in the given location.
   *
   * @param loc - The target location.
   */
  in(loc: Location): Time {
    return new Time(this.epochNs, loc);
  }

  /** Returns a copy of `t` with the location set to {@link UTC}. */
  utc(): Time {
    return this.in(UTC);
  }

  /** Returns a copy of `t` with the location set to the local time zone. */
  local(): Time {
    return this.in(Local);
  }

  /**
   * Returns the abbreviated time zone name in effect at `t` and its offset
   * in seconds east of UTC.
   *
   * @returns A tuple `[name, offsetSeconds]`.
   */
  zone(): [string, number] {
    if (this.loc.fixedOffsetSeconds !== undefined) {
      return [this.loc.name, this.loc.fixedOffsetSeconds];
    }

    if (this.loc.name === "UTC") {
      return ["UTC", 0];
    }

    const date = this.toDate();
    if (this.loc.name === "Local") {
      const offsetSeconds = -date.getTimezoneOffset() * 60;
      return ["Local", offsetSeconds];
    }

    const offsetSeconds = getOffsetSecondsForZone(date, this.loc.name);
    return [this.loc.name, offsetSeconds];
  }

  /** Returns `true` if `t` is the zero time (epoch nanoseconds === 0). */
  isZero(): boolean {
    return this.epochNs === 0n;
  }

  /** Returns the four-digit year in which `t` occurs. */
  year(): number {
    return this.toDate().getUTCFullYear();
  }

  /** Returns the month of the year in which `t` occurs. */
  month(): Month {
    return (this.toDate().getUTCMonth() + 1) as Month;
  }

  /** Returns the day of the month in which `t` occurs (1-based). */
  day(): number {
    return this.toDate().getUTCDate();
  }

  /** Returns the hour within the day specified by `t` (0–23). */
  hour(): number {
    return this.toDate().getUTCHours();
  }

  /** Returns the minute offset within the hour specified by `t` (0–59). */
  minute(): number {
    return this.toDate().getUTCMinutes();
  }

  /** Returns the second offset within the minute specified by `t` (0–59). */
  second(): number {
    return this.toDate().getUTCSeconds();
  }

  /**
   * Returns the hour, minute, and second of the time of day.
   *
   * @returns `[hour, minute, second]`.
   */
  clock(): [number, number, number] {
    const d = this.toDate();
    return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
  }

  /**
   * Returns the year, month, and day of the time.
   *
   * @returns `[year, month, day]`.
   */
  date(): [number, Month, number] {
    const d = this.toDate();
    return [d.getUTCFullYear(), (d.getUTCMonth() + 1) as Month, d.getUTCDate()];
  }

  /** Returns the nanosecond offset within the second specified by `t` (0–999,999,999). */
  nanosecond(): number {
    const mod = this.epochNs % NS_PER_S;
    return Number(mod < 0n ? mod + NS_PER_S : mod);
  }

  /** Returns the day of the week in which `t` occurs. */
  weekday(): Weekday {
    return this.toDate().getUTCDay() as Weekday;
  }

  /** Returns the day of the year in which `t` occurs (1–366). */
  yearDay(): number {
    const d = this.toDate();
    const start = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.floor((d.getTime() - start) / 86_400_000) + 1;
  }

  /**
   * Returns the ISO 8601 year and week number.
   *
   * @returns `[isoYear, week]` where `week` is in the range 1–53.
   */
  isoWeek(): [number, number] {
    const d = this.toDate();
    const weekDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = weekDate.getUTCDay() || 7;
    weekDate.setUTCDate(weekDate.getUTCDate() + 4 - day);
    const isoYear = weekDate.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return [isoYear, week];
  }

  /**
   * Returns the time corresponding to adding the given number of years, months,
   * and days to `t`. For example, `addDate(0, 1, -1)` applied to January 1
   * returns December 31 of the same year.
   *
   * @param years - Years to add (may be negative).
   * @param months - Months to add (may be negative).
   * @param days - Days to add (may be negative).
   */
  addDate(years: number, months: number, days: number): Time {
    const d = this.toDate();
    const totalNs = this.nanosecond();
    const msPart = Math.floor(totalNs / 1_000_000);
    const subMsNs = BigInt(totalNs - msPart * 1_000_000);

    const nextMs = Date.UTC(
      d.getUTCFullYear() + years,
      d.getUTCMonth() + months,
      d.getUTCDate() + days,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      msPart
    );

    return new Time(BigInt(nextMs) * NS_PER_MS + subMsNs, this.loc);
  }

  /**
   * Returns a textual representation of the time value formatted according to
   * the given layout string. Use the layout constants from `layout.ts` (e.g.
   * {@link RFC3339}, {@link DateOnly}).
   *
   * @param layout - A layout constant from this package.
   * @returns The formatted time string.
   * @throws {Error} If the layout is not yet supported.
   */
  format(layout: string): string {
    if (layout === RFC3339) {
      return this.toDate().toISOString();
    }
    if (layout === RFC3339Nano) {
      return formatRfc3339Nano(this.epochNs);
    }
    if (layout === DateOnly) {
      return this.toDate().toISOString().slice(0, 10);
    }
    if (layout === TimeOnly) {
      return this.toDate().toISOString().slice(11, 19);
    }
    if (layout === ANSIC) {
      return `${weekdayShortName(this.weekday())} ${monthShortName(this.month())} ${padSpace(this.day(), 2)} ${pad2(this.hour())}:${pad2(this.minute())}:${pad2(this.second())} ${this.year()}`;
    }
    if (layout === UnixDate) {
      const [zoneName, offset] = this.zone();
      return `${weekdayShortName(this.weekday())} ${monthShortName(this.month())} ${padSpace(this.day(), 2)} ${pad2(this.hour())}:${pad2(this.minute())}:${pad2(this.second())} ${zoneToken(zoneName, offset)} ${this.year()}`;
    }
    if (layout === RubyDate) {
      const [, offset] = this.zone();
      return `${weekdayShortName(this.weekday())} ${monthShortName(this.month())} ${pad2(this.day())} ${pad2(this.hour())}:${pad2(this.minute())}:${pad2(this.second())} ${formatOffset(offset)} ${this.year()}`;
    }
    if (layout === RFC822) {
      const [zoneName, offset] = this.zone();
      return `${pad2(this.day())} ${monthShortName(this.month())} ${pad2(this.year() % 100)} ${pad2(this.hour())}:${pad2(this.minute())} ${zoneToken(zoneName, offset)}`;
    }
    if (layout === RFC822Z) {
      const [, offset] = this.zone();
      return `${pad2(this.day())} ${monthShortName(this.month())} ${pad2(this.year() % 100)} ${pad2(this.hour())}:${pad2(this.minute())} ${formatOffset(offset)}`;
    }
    if (layout === RFC850) {
      const [zoneName, offset] = this.zone();
      return `${weekdayLongName(this.weekday())}, ${pad2(this.day())}-${monthShortName(this.month())}-${pad2(this.year() % 100)} ${pad2(this.hour())}:${pad2(this.minute())}:${pad2(this.second())} ${zoneToken(zoneName, offset)}`;
    }
    if (layout === RFC1123) {
      const [zoneName, offset] = this.zone();
      return `${weekdayShortName(this.weekday())}, ${pad2(this.day())} ${monthShortName(this.month())} ${this.year()} ${pad2(this.hour())}:${pad2(this.minute())}:${pad2(this.second())} ${zoneToken(zoneName, offset)}`;
    }
    if (layout === RFC1123Z) {
      const [, offset] = this.zone();
      return `${weekdayShortName(this.weekday())}, ${pad2(this.day())} ${monthShortName(this.month())} ${this.year()} ${pad2(this.hour())}:${pad2(this.minute())}:${pad2(this.second())} ${formatOffset(offset)}`;
    }
    if (layout === Kitchen) {
      const hour = this.hour();
      const minute = this.minute();
      const ampm = hour >= 12 ? "PM" : "AM";
      const h12 = hour % 12 === 0 ? 12 : hour % 12;
      return `${h12}:${minute.toString().padStart(2, "0")}${ampm}`;
    }
    if (layout === Stamp) {
      return `${monthShortName(this.month())} ${padSpace(this.day(), 2)} ${pad2(this.hour())}:${pad2(this.minute())}:${pad2(this.second())}`;
    }
    if (layout === StampMilli || layout === StampMicro || layout === StampNano) {
      const ns = this.nanosecond().toString().padStart(9, "0");
      let frac: string;
      if (layout === StampMilli) {
        frac = ns.slice(0, 3);
      } else if (layout === StampMicro) {
        frac = ns.slice(0, 6);
      } else {
        frac = ns;
      }
      return `${monthShortName(this.month())} ${padSpace(this.day(), 2)} ${pad2(this.hour())}:${pad2(this.minute())}:${pad2(this.second())}.${frac}`;
    }
    if (layout === DateTime) {
      return `${this.toDate().toISOString().slice(0, 10)} ${this.toDate().toISOString().slice(11, 19)}`;
    }
    throw new Error(`layout not implemented yet: ${layout}`);
  }

  /** Returns the time formatted as {@link RFC3339Nano}. */
  toString(): string {
    return this.format(RFC3339Nano);
  }

  private toDate(): Date {
    return new Date(Number(this.epochNs / NS_PER_MS));
  }
}

/**
 * Returns the current local time, with both a wall-clock and monotonic reading.
 * The monotonic value is used by {@link Time.sub} to measure elapsed time
 * accurately.
 */
export function now(): Time {
  const nowMs = Date.now();
  const monoNs = BigInt(Math.trunc(performance.now() * 1_000_000));
  return new Time(BigInt(nowMs) * NS_PER_MS, Local, monoNs);
}

/**
 * Returns the local {@link Time} corresponding to the given Unix time, where
 * `sec` is seconds and `nsec` is additional nanoseconds since January 1, 1970
 * UTC.
 *
 * @param sec - Seconds since the Unix epoch.
 * @param nsec - Additional nanoseconds (default `0n`).
 */
export function unix(sec: bigint, nsec: bigint = 0n): Time {
  return new Time(sec * NS_PER_S + nsec, Local);
}

/**
 * Returns the local {@link Time} corresponding to `ms` milliseconds since the
 * Unix epoch.
 *
 * @param ms - Milliseconds since the Unix epoch.
 */
export function unixMilli(ms: bigint): Time {
  return new Time(ms * NS_PER_MS, Local);
}

/**
 * Returns the local {@link Time} corresponding to `us` microseconds since the
 * Unix epoch.
 *
 * @param us - Microseconds since the Unix epoch.
 */
export function unixMicro(us: bigint): Time {
  return new Time(us * 1_000n, Local);
}

/**
 * Returns the {@link Time} corresponding to the given calendar fields in the
 * given location.
 *
 * @param year - Four-digit year.
 * @param month - Month of the year (1 = January).
 * @param day - Day of the month.
 * @param hour - Hour of the day (0–23).
 * @param min - Minute of the hour (0–59).
 * @param sec - Second of the minute (0–59).
 * @param nsec - Nanosecond offset within the second.
 * @param loc - Location; defaults to {@link UTC}.
 */
export function date(
  year: number,
  month: Month,
  day: number,
  hour: number,
  min: number,
  sec: number,
  nsec: number,
  loc: Location = UTC
): Time {
  const ms = Date.UTC(year, month - 1, day, hour, min, sec, Math.floor(nsec / 1_000_000));
  const extraNs = BigInt(nsec % 1_000_000);
  return new Time(BigInt(ms) * NS_PER_MS + extraNs, loc);
}

/**
 * Returns the elapsed time since `t`. It is shorthand for `now().sub(t)`.
 *
 * @param t - The reference time.
 */
export function since(t: Time): Duration {
  return now().sub(t);
}

/**
 * Returns the duration until `t`. It is shorthand for `t.sub(now())`.
 *
 * @param t - The target time.
 */
export function until(t: Time): Duration {
  return t.sub(now());
}

/**
 * Parses a formatted string and returns the time value it represents.
 *
 * The `layout` specifies the format; use the constants from `layout.ts` (e.g.
 * {@link RFC3339}, {@link DateOnly}). Parsed times are always in {@link UTC}
 * unless the layout encodes an explicit offset.
 *
 * @param layout - A layout constant.
 * @param value - The formatted time string.
 * @returns The parsed {@link Time} in UTC.
 * @throws {Error} If the value cannot be parsed with the given layout, or the
 *   layout is not yet supported.
 */
export function parse(layout: string, value: string): Time {
  if (layout === RFC3339) {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      throw new TypeError(`cannot parse time: ${value}`);
    }
    return new Time(BigInt(ms) * NS_PER_MS, UTC);
  }

  if (layout === RFC3339Nano) {
    const parsed = parseRfc3339Nano(value);
    if (parsed === null) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    return new Time(parsed, UTC);
  }

  if (layout === DateOnly) {
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isNaN(ms)) {
      throw new TypeError(`cannot parse time: ${value}`);
    }
    return new Time(BigInt(ms) * NS_PER_MS, UTC);
  }

  if (layout === DateTime) {
    const ms = Date.parse(value.replace(" ", "T") + "Z");
    if (Number.isNaN(ms)) {
      throw new TypeError(`cannot parse time: ${value}`);
    }
    return new Time(BigInt(ms) * NS_PER_MS, UTC);
  }

  if (layout === ANSIC) {
    const m = /^(\w{3})\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/.exec(value);
    if (!m) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const monthToken = m[2]!;
    const month = monthFromShortName(monthToken);
    if (!month) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const ms = Date.UTC(
      Number(m[7]),
      month - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
      0
    );
    return new Time(BigInt(ms) * NS_PER_MS, UTC);
  }

  if (
    layout === UnixDate ||
    layout === RubyDate ||
    layout === RFC822 ||
    layout === RFC822Z ||
    layout === RFC850 ||
    layout === RFC1123 ||
    layout === RFC1123Z
  ) {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      throw new TypeError(`cannot parse time: ${value}`);
    }
    return new Time(BigInt(ms) * NS_PER_MS, UTC);
  }

  if (layout === TimeOnly) {
    const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (!m) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const ms = Date.UTC(0, 0, 1, Number(m[1]), Number(m[2]), Number(m[3]), 0);
    return new Time(BigInt(ms) * NS_PER_MS, UTC);
  }

  if (layout === Kitchen) {
    const m = /^(\d{1,2}):(\d{2})(AM|PM)$/.exec(value);
    if (!m) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const hourBase = Number(m[1]) % 12;
    const hour = m[3] === "PM" ? hourBase + 12 : hourBase;
    const minute = Number(m[2]);
    const ms = Date.UTC(0, 0, 1, hour, minute, 0, 0);
    return new Time(BigInt(ms) * NS_PER_MS, UTC);
  }

  if (layout === Stamp || layout === StampMilli || layout === StampMicro || layout === StampNano) {
    let base: RegExp;
    if (layout === Stamp) {
      base = /^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})$/;
    } else if (layout === StampMilli) {
      base = /^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;
    } else if (layout === StampMicro) {
      base = /^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{6})$/;
    } else {
      base = /^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{9})$/;
    }

    const m = base.exec(value);
    if (!m) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const monthToken = m[1]!;

    const month = monthFromShortName(monthToken);
    if (!month) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const day = Number(m[2]);
    const hour = Number(m[3]);
    const minute = Number(m[4]);
    const second = Number(m[5]);
    const fracRaw = m[6] ?? "";
    const nanos = fracRaw.length > 0 ? Number(fracRaw.padEnd(9, "0")) : 0;
    const ms = Date.UTC(0, month - 1, day, hour, minute, second, Math.floor(nanos / 1_000_000));
    const extraNs = BigInt(nanos % 1_000_000);
    return new Time(BigInt(ms) * NS_PER_MS + extraNs, UTC);
  }

  throw new Error(`layout not implemented yet: ${layout}`);
}

/**
 * Like {@link parse}, but interprets the result in the given location rather
 * than UTC. For layouts that already encode timezone information ({@link RFC3339},
 * {@link RFC3339Nano}), the explicit offset wins and the location is applied
 * afterward.
 *
 * @param layout - A layout constant.
 * @param value - The formatted time string.
 * @param loc - The location to assign to the parsed time.
 * @returns The parsed {@link Time} in `loc`.
 * @throws {Error} If the value cannot be parsed with the given layout.
 */
export function parseInLocation(layout: string, value: string, loc: Location): Time {
  if (layout === RFC3339 || layout === RFC3339Nano) {
    return parse(layout, value).in(loc);
  }

  if (layout === DateOnly) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    return fromLocationClock(year, month, day, 0, 0, 0, loc);
  }

  if (layout === DateTime) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (!m) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6]);
    return fromLocationClock(year, month, day, hour, minute, second, loc);
  }

  if (layout === TimeOnly) {
    const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (!m) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    return fromLocationClock(0, 1, 1, Number(m[1]), Number(m[2]), Number(m[3]), loc);
  }

  if (layout === Kitchen) {
    const m = /^(\d{1,2}):(\d{2})(AM|PM)$/.exec(value);
    if (!m) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const hourBase = Number(m[1]) % 12;
    const hour = m[3] === "PM" ? hourBase + 12 : hourBase;
    return fromLocationClock(0, 1, 1, hour, Number(m[2]), 0, loc);
  }

  return parse(layout, value).in(loc);
}

export function sleep(d: Duration): Promise<void> {
  const ms = Number(d.nanoseconds() / NS_PER_MS);
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fromLocationClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  loc: Location
): Time {
  if (loc.fixedOffsetSeconds !== undefined) {
    const utcMs =
      Date.UTC(year, month - 1, day, hour, minute, second, 0) - loc.fixedOffsetSeconds * 1_000;
    return new Time(BigInt(utcMs) * NS_PER_MS, loc);
  }

  if (loc.name === "UTC") {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
    return new Time(BigInt(utcMs) * NS_PER_MS, loc);
  }

  if (loc.name === "Local") {
    const localMs = new Date(year, month - 1, day, hour, minute, second, 0).getTime();
    return new Time(BigInt(localMs) * NS_PER_MS, loc);
  }

  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const guessedDate = new Date(guessUtc);
  const offset = getOffsetSecondsForZone(guessedDate, loc.name);
  const utcMs = guessUtc - offset * 1_000;
  return new Time(BigInt(utcMs) * NS_PER_MS, loc);
}

function getOffsetSecondsForZone(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const part = fmt.formatToParts(date).find((p) => p.type === "timeZoneName")?.value;
  if (!part) {
    return 0;
  }

  if (part === "GMT" || part === "UTC") {
    return 0;
  }

  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(part);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * ((hours * 60 + minutes) * 60);
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function padSpace(n: number, width: number): string {
  return n.toString().padStart(width, " ");
}

function monthShortName(month: Month): string {
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  return names[month - 1] ?? "Jan";
}

function monthFromShortName(name: string): number | null {
  const table: Record<string, number> = {
    Jan: 1,
    Feb: 2,
    Mar: 3,
    Apr: 4,
    May: 5,
    Jun: 6,
    Jul: 7,
    Aug: 8,
    Sep: 9,
    Oct: 10,
    Nov: 11,
    Dec: 12
  };

  return table[name] ?? null;
}

function weekdayShortName(weekday: Weekday): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return names[weekday] ?? "Sun";
}

function weekdayLongName(weekday: Weekday): string {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return names[weekday] ?? "Sunday";
}

function formatOffset(offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? "-" : "+";
  const abs = Math.abs(offsetSeconds);
  const hh = Math.floor(abs / 3600);
  const mm = Math.floor((abs % 3600) / 60);
  return `${sign}${hh.toString().padStart(2, "0")}${mm.toString().padStart(2, "0")}`;
}

function zoneToken(name: string, offsetSeconds: number): string {
  if (offsetSeconds === 0) {
    return "GMT";
  }
  if (/^[A-Za-z]{1,5}$/.test(name)) {
    return name;
  }
  return formatOffset(offsetSeconds);
}

function formatRfc3339Nano(epochNs: bigint): string {
  const seconds = epochNs / NS_PER_S;
  const nsRemainder = epochNs % NS_PER_S;
  const normalizedNs = nsRemainder < 0n ? nsRemainder + NS_PER_S : nsRemainder;
  const epochMs = Number(seconds * 1000n);
  const d = new Date(epochMs);
  const base = d.toISOString().slice(0, 19);

  if (normalizedNs === 0n) {
    return `${base}Z`;
  }

  const frac = normalizedNs.toString().padStart(9, "0").replace(/0+$/, "");
  return `${base}.${frac}Z`;
}

function parseRfc3339Nano(value: string): bigint | null {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value
    );
  if (!m) {
    return null;
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const frac = m[7] ?? "";
  const zone = m[8]!;

  const nanos = frac.length > 0 ? BigInt(frac.padEnd(9, "0")) : 0n;
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);

  let offsetSeconds = 0;
  if (zone !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    const zh = Number(zone.slice(1, 3));
    const zm = Number(zone.slice(4, 6));
    offsetSeconds = sign * ((zh * 60 + zm) * 60);
  }

  return BigInt(utcMs) * NS_PER_MS + nanos - BigInt(offsetSeconds) * NS_PER_S;
}

export { Nanosecond, parseDuration } from "./duration.js";
