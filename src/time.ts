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
  RubyDate,
  Stamp,
  StampMilli,
  type SupportedLayout,
  TimeOnly,
  UnixDate
} from "./layout.js";
import { Duration } from "./duration.js";
import { Local, Location, UTC } from "./location.js";

const MILLISECONDS_PER_SECOND = 1_000n;

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

export interface DateFields {
  year: number;
  month: Month;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  location?: Location;
}

export interface ZoneInfo {
  name: string;
  offsetSeconds: number;
}

export interface ClockInfo {
  hour: number;
  minute: number;
  second: number;
}

export interface DateInfo {
  year: number;
  month: Month;
  day: number;
}

export interface IsoWeekInfo {
  year: number;
  week: number;
}

/**
 * An immutable point in time with millisecond precision.
 *
 * Internally the value is stored as whole milliseconds since the Unix epoch
 * (UTC), represented as a `bigint`. An optional monotonic clock reading is captured by
 * {@link now} and used by {@link sub} for accurate elapsed-time
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
  private readonly epochMilliseconds: bigint;
  private readonly loc: Location;
  private readonly monotonicMilliseconds: bigint | undefined;

  /**
   * Creates a wall-clock time with millisecond precision.
   *
   * Prefer {@link now}, {@link unix}, {@link unixMilli}, {@link date}, and
   * {@link parse} for most callers.
   *
   * Publicly constructed `Time` values do not carry a monotonic reading.
   *
   * @param epochMilliseconds - Milliseconds since the Unix epoch.
   * @param loc - The time zone location to associate with the instant.
   */
  constructor(epochMilliseconds: bigint, loc?: Location);
  constructor(epochMilliseconds: bigint, loc: Location = UTC, monotonicMilliseconds?: bigint) {
    this.epochMilliseconds = normalizeEpochMilliseconds(epochMilliseconds);
    this.loc = loc;
    this.monotonicMilliseconds =
      monotonicMilliseconds === undefined
        ? undefined
        : normalizeEpochMilliseconds(monotonicMilliseconds);
  }

  /**
   * Returns the time `t + d`.
   *
   * @param d - The duration to add. Negative values move the time backward.
   */
  add(d: Duration): Time {
    return createTimeWithMonotonic(
      this.epochMilliseconds + d.milliseconds(),
      this.loc,
      this.monotonicMilliseconds
    );
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
    if (this.monotonicMilliseconds !== undefined && other.monotonicMilliseconds !== undefined) {
      return new Duration(this.monotonicMilliseconds - other.monotonicMilliseconds);
    }
    return new Duration(this.epochMilliseconds - other.epochMilliseconds);
  }

  /**
   * Compares this time with `other`.
   *
   * @returns `-1` if `t < other`, `0` if `t == other`, `1` if `t > other`.
   */
  compare(other: Time): number {
    const diff = this.sub(other).milliseconds();
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
    return this.epochMilliseconds / MILLISECONDS_PER_SECOND;
  }

  /** Returns the Unix timestamp in whole milliseconds. */
  unixMilli(): bigint {
    return this.epochMilliseconds;
  }

  /**
   * Returns the result of rounding `t` down to a multiple of `d` since the
   * Unix epoch. If `d` is zero or negative, `t` is returned unchanged.
   *
   * @param d - The truncation unit.
   */
  truncate(d: Duration): Time {
    const step = d.milliseconds();
    if (step <= 0n) {
      return this;
    }

    return new Time((this.epochMilliseconds / step) * step, this.loc);
  }

  /**
   * Returns the result of rounding `t` to the nearest multiple of `d` since
   * the Unix epoch. Ties round up. If `d` is zero or negative, `t` is returned
   * unchanged.
   *
   * @param d - The rounding unit.
   */
  round(d: Duration): Time {
    const step = d.milliseconds();
    if (step <= 0n) {
      return this;
    }

    const rem = this.epochMilliseconds % step;
    if (rem === 0n) {
      return this;
    }

    const absRem = rem < 0n ? -rem : rem;
    if (absRem * 2n < step) {
      return new Time(this.epochMilliseconds - rem, this.loc);
    }

    if (this.epochMilliseconds >= 0n) {
      return new Time(this.epochMilliseconds + (step - rem), this.loc);
    }

    return new Time(this.epochMilliseconds - (step + rem), this.loc);
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
    return new Time(this.epochMilliseconds, loc);
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
   * @returns An object containing the zone name and offset in seconds.
   */
  zone(): ZoneInfo {
    if (this.loc.fixedOffsetSeconds !== undefined) {
      return { name: this.loc.name, offsetSeconds: this.loc.fixedOffsetSeconds };
    }

    if (this.loc.name === "UTC") {
      return { name: "UTC", offsetSeconds: 0 };
    }

    const date = this.toDate();
    if (this.loc.name === "Local") {
      const offsetSeconds = -date.getTimezoneOffset() * 60;
      return { name: "Local", offsetSeconds };
    }

    const offsetSeconds = getOffsetSecondsForZone(date, this.loc.name);
    return { name: this.loc.name, offsetSeconds };
  }

  /** Returns `true` if `t` is the zero time (epoch milliseconds === 0). */
  isZero(): boolean {
    return this.epochMilliseconds === 0n;
  }

  /** Returns the four-digit year in which `t` occurs. */
  year(): number {
    return getLocalComponents(this.epochMilliseconds, this.loc).year;
  }

  /** Returns the month of the year in which `t` occurs. */
  month(): Month {
    return getLocalComponents(this.epochMilliseconds, this.loc).month as Month;
  }

  /** Returns the day of the month in which `t` occurs (1-based). */
  day(): number {
    return getLocalComponents(this.epochMilliseconds, this.loc).day;
  }

  /** Returns the hour within the day specified by `t` (0–23). */
  hour(): number {
    return getLocalComponents(this.epochMilliseconds, this.loc).hour;
  }

  /** Returns the minute offset within the hour specified by `t` (0–59). */
  minute(): number {
    return getLocalComponents(this.epochMilliseconds, this.loc).minute;
  }

  /** Returns the second offset within the minute specified by `t` (0–59). */
  second(): number {
    return getLocalComponents(this.epochMilliseconds, this.loc).second;
  }

  /**
   * Returns the hour, minute, and second of the time of day.
   *
   * @returns An object containing the time-of-day fields.
   */
  clock(): ClockInfo {
    const local = getLocalComponents(this.epochMilliseconds, this.loc);
    return { hour: local.hour, minute: local.minute, second: local.second };
  }

  /**
   * Returns the year, month, and day of the time.
   *
   * @returns An object containing the calendar date fields.
   */
  date(): DateInfo {
    const local = getLocalComponents(this.epochMilliseconds, this.loc);
    return { year: local.year, month: local.month as Month, day: local.day };
  }

  /** Returns the millisecond offset within the second specified by `t` (0–999). */
  millisecond(): number {
    const mod = this.epochMilliseconds % MILLISECONDS_PER_SECOND;
    const normalized = mod < 0n ? mod + MILLISECONDS_PER_SECOND : mod;
    return Number(normalized);
  }

  /** Returns the day of the week in which `t` occurs. */
  weekday(): Weekday {
    const local = getLocalComponents(this.epochMilliseconds, this.loc);
    const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
    return localDate.getUTCDay() as Weekday;
  }

  /** Returns the day of the year in which `t` occurs (1–366). */
  yearDay(): number {
    const local = getLocalComponents(this.epochMilliseconds, this.loc);
    const start = Date.UTC(local.year, 0, 1);
    const day = Date.UTC(local.year, local.month - 1, local.day);
    return Math.floor((day - start) / 86_400_000) + 1;
  }

  /**
   * Returns the ISO 8601 year and week number.
   *
   * @returns An object containing the ISO year and week number.
   */
  isoWeek(): IsoWeekInfo {
    const local = getLocalComponents(this.epochMilliseconds, this.loc);
    const weekDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
    const day = weekDate.getUTCDay() || 7;
    weekDate.setUTCDate(weekDate.getUTCDate() + 4 - day);
    const isoYear = weekDate.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return { year: isoYear, week };
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
    const local = getLocalComponents(this.epochMilliseconds, this.loc);
    const totalMs = this.millisecond();

    const nextDate = new Date(
      Date.UTC(
        local.year + years,
        local.month - 1 + months,
        local.day + days,
        local.hour,
        local.minute,
        local.second,
        totalMs
      )
    );

    const result = new Time(BigInt(nextDate.getTime()), this.loc);

    if (this.loc.fixedOffsetSeconds !== undefined) {
      const offsetMs = this.loc.fixedOffsetSeconds * 1_000;
      return new Time(result.epochMilliseconds - BigInt(offsetMs) * 1_000n, this.loc);
    }

    if (this.loc.name === "UTC" || this.loc.name === "Local") {
      return result;
    }

    const offset = getOffsetSecondsForZone(nextDate, this.loc.name);
    const offsetMs = offset * 1_000;
    return new Time(result.epochMilliseconds - BigInt(offsetMs) * 1_000n, this.loc);
  }

  /**
   * Returns a textual representation of the time value formatted according to
   * the given layout.
   *
   * For TypeScript callers, pass one of the exported layout constants such as
   * {@link RFC3339} or {@link DateOnly}.
   *
   * @param layout - A supported layout constant.
   * @returns The formatted time string.
   * @throws {Error} If the layout is unsupported.
   */
  format(layout: SupportedLayout): string;
  format(layout: string): string;
  format(layout: string): string {
    const formatter = FORMATTERS[layout as SupportedLayout];
    if (!formatter) {
      throw new Error(`unsupported layout: ${layout}`);
    }
    return formatter(this);
  }

  /** Returns the time formatted as {@link RFC3339}. */
  toString(): string {
    return this.format(RFC3339);
  }

  private toDate(): Date {
    return new Date(Number(this.epochMilliseconds));
  }
}

/**
 * Returns the current local time, with both a wall-clock and monotonic reading.
 * The monotonic value is used by {@link Time.sub} to measure elapsed time
 * accurately.
 */
export function now(): Time {
  const nowMs = BigInt(Date.now());
  const monotonicMs = BigInt(Math.trunc(performance.now()));
  return createTimeWithMonotonic(nowMs, Local, monotonicMs);
}

/**
 * Returns the local {@link Time} corresponding to the given Unix time, where
 * `sec` is seconds and `msec` is additional milliseconds since January 1, 1970
 * UTC.
 *
 * @param sec - Seconds since the Unix epoch.
 * @param msec - Additional milliseconds (default `0n`).
 */
export function unix(sec: bigint, msec: bigint = 0n): Time {
  return new Time(sec * MILLISECONDS_PER_SECOND + msec, Local);
}

/**
 * Returns the local {@link Time} corresponding to `ms` milliseconds since the
 * Unix epoch.
 *
 * @param ms - Milliseconds since the Unix epoch.
 */
export function unixMilli(ms: bigint): Time {
  return new Time(ms, Local);
}

/**
 * Returns the {@link Time} corresponding to the given calendar fields.
 *
 * Callers may use either positional arguments or an object literal.
 *
 * Positional form:
 * `date(year, month, day, hour, minute, second, millisecond, location?)`
 *
 * Object form:
 * `date({ year, month, day, hour, minute, second, millisecond, location })`
 */
export function date(
  ...args: [DateFields] | [number, Month, number, number, number, number, number, Location?]
): Time {
  const parts = normalizeDateFields(args);
  const { year, month, day, hour, minute, second, millisecond, location = UTC } = parts;

  if (location.fixedOffsetSeconds !== undefined) {
    const utcMs =
      Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
      location.fixedOffsetSeconds * 1_000;
    return new Time(BigInt(utcMs), location);
  }

  if (location.name === "UTC") {
    const ms = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    return new Time(BigInt(ms), location);
  }

  if (location.name === "Local") {
    const localMs = new Date(year, month - 1, day, hour, minute, second, millisecond).getTime();
    return new Time(BigInt(localMs), location);
  }

  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const guessedDate = new Date(guessUtc);
  const offset = getOffsetSecondsForZone(guessedDate, location.name);
  const utcMs = guessUtc - offset * 1_000;
  return new Time(BigInt(utcMs), location);
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
 * For TypeScript callers, pass one of the exported layout constants such as
 * {@link RFC3339} or {@link DateOnly}. Parsed times are returned in {@link UTC}
 * unless the layout encodes an explicit offset.
 *
 * @param layout - A supported layout constant.
 * @param value - The formatted time string.
 * @returns The parsed {@link Time} in UTC.
 * @throws {Error} If the value cannot be parsed with the given layout, or the
 *   layout is unsupported.
 */
export function parse(layout: SupportedLayout, value: string): Time;
export function parse(layout: string, value: string): Time;
export function parse(layout: string, value: string): Time {
  const parser = PARSERS[layout as SupportedLayout];
  if (!parser) {
    throw new Error(`unsupported layout: ${layout}`);
  }
  return parser(value);
}

/**
 * Like {@link parse}, but interprets the result in the given location rather
 * than UTC.
 *
 * For layouts that already encode timezone information ({@link RFC3339}), the
 * explicit offset wins and the requested location is applied afterward.
 *
 * @param layout - A supported layout constant.
 * @param value - The formatted time string.
 * @param loc - The location to assign to the parsed time.
 * @returns The parsed {@link Time} in `loc`.
 * @throws {Error} If the value cannot be parsed with the given layout, or the
 *   layout is unsupported.
 */
export function parseInLocation(layout: SupportedLayout, value: string, loc: Location): Time;
export function parseInLocation(layout: string, value: string, loc: Location): Time;
export function parseInLocation(layout: string, value: string, loc: Location): Time {
  if (layout === RFC3339) {
    return parse(layout, value).in(loc);
  }

  if (layout === DateOnly) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const parts: DateTimeParts = {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    };
    assertValidDateTimeParts(parts, value);
    return fromLocationClock(parts.year, parts.month, parts.day, 0, 0, 0, loc);
  }

  if (layout === DateTime) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (!m) {
      throw new TypeError(`cannot parse time: ${value}`);
    }

    const parts: DateTimeParts = {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
      second: Number(m[6]),
      millisecond: 0
    };
    assertValidDateTimeParts(parts, value);
    return fromLocationClock(
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      loc
    );
  }

  if (layout === TimeOnly) {
    const timeParts = parseTimeOnlyValue(value);
    return fromLocationClock(1900, 1, 1, timeParts.hour, timeParts.minute, timeParts.second, loc);
  }

  if (layout === Kitchen) {
    const kitchenParts = parseKitchenValue(value);
    return fromLocationClock(1900, 1, 1, kitchenParts.hour, kitchenParts.minute, 0, loc);
  }

  return parse(layout, value).in(loc);
}

export function sleep(d: Duration): Promise<void> {
  const ms = Number(d.milliseconds());
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
    return new Time(BigInt(utcMs), loc);
  }

  if (loc.name === "UTC") {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
    return new Time(BigInt(utcMs), loc);
  }

  if (loc.name === "Local") {
    const localMs = new Date(year, month - 1, day, hour, minute, second, 0).getTime();
    return new Time(BigInt(localMs), loc);
  }

  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const guessedDate = new Date(guessUtc);
  const offset = getOffsetSecondsForZone(guessedDate, loc.name);
  const utcMs = guessUtc - offset * 1_000;
  return new Time(BigInt(utcMs), loc);
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

function formatOffsetRfc3339(offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? "-" : "+";
  const abs = Math.abs(offsetSeconds);
  const hh = Math.floor(abs / 3600);
  const mm = Math.floor((abs % 3600) / 60);
  return `${sign}${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

interface LocalComponents {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  offset: number;
}

function getLocalComponents(epochMilliseconds: bigint, loc: Location): LocalComponents {
  const utcDate = new Date(Number(epochMilliseconds));

  if (loc.fixedOffsetSeconds !== undefined) {
    const offsetMs = loc.fixedOffsetSeconds * 1_000;
    const localMs = utcDate.getTime() + offsetMs;
    const localDate = new Date(localMs);

    return {
      year: localDate.getUTCFullYear(),
      month: localDate.getUTCMonth() + 1,
      day: localDate.getUTCDate(),
      hour: localDate.getUTCHours(),
      minute: localDate.getUTCMinutes(),
      second: localDate.getUTCSeconds(),
      offset: loc.fixedOffsetSeconds
    };
  }

  if (loc.name === "UTC") {
    return {
      year: utcDate.getUTCFullYear(),
      month: utcDate.getUTCMonth() + 1,
      day: utcDate.getUTCDate(),
      hour: utcDate.getUTCHours(),
      minute: utcDate.getUTCMinutes(),
      second: utcDate.getUTCSeconds(),
      offset: 0
    };
  }

  if (loc.name === "Local") {
    return {
      year: utcDate.getFullYear(),
      month: utcDate.getMonth() + 1,
      day: utcDate.getDate(),
      hour: utcDate.getHours(),
      minute: utcDate.getMinutes(),
      second: utcDate.getSeconds(),
      offset: -utcDate.getTimezoneOffset() * 60
    };
  }

  const offset = getOffsetSecondsForZone(utcDate, loc.name);
  const offsetMs = offset * 1_000;
  const localMs = utcDate.getTime() + offsetMs;
  const localDate = new Date(localMs);

  return {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
    hour: localDate.getUTCHours(),
    minute: localDate.getUTCMinutes(),
    second: localDate.getUTCSeconds(),
    offset
  };
}

function normalizeEpochMilliseconds(epochMilliseconds: bigint): bigint {
  return epochMilliseconds;
}

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

interface ClockParts {
  hour: number;
  minute: number;
  second: number;
}

type TimeFormatter = (time: Time) => string;
type TimeParser = (value: string) => Time;

const FORMATTERS: Record<SupportedLayout, TimeFormatter> = {
  [RFC3339]: formatRfc3339,
  [DateOnly]: formatDateOnly,
  [TimeOnly]: formatTimeOnly,
  [ANSIC]: formatAnsic,
  [UnixDate]: formatUnixDate,
  [RubyDate]: formatRubyDate,
  [RFC822]: formatRfc822,
  [RFC822Z]: formatRfc822Z,
  [RFC850]: formatRfc850,
  [RFC1123]: formatRfc1123,
  [RFC1123Z]: formatRfc1123Z,
  [Kitchen]: formatKitchen,
  [Stamp]: formatStamp,
  [StampMilli]: formatStampMilli,
  [DateTime]: formatDateTime
};

const PARSERS: Record<SupportedLayout, TimeParser> = {
  [RFC3339]: parseRfc3339Value,
  [DateOnly]: parseDateOnlyValue,
  [DateTime]: parseDateTimeValue,
  [ANSIC]: parseAnsicValue,
  [UnixDate]: parseDateParseValue,
  [RubyDate]: parseDateParseValue,
  [RFC822]: parseDateParseValue,
  [RFC822Z]: parseDateParseValue,
  [RFC850]: parseDateParseValue,
  [RFC1123]: parseDateParseValue,
  [RFC1123Z]: parseDateParseValue,
  [TimeOnly]: parseTimeOnly,
  [Kitchen]: parseKitchen,
  [Stamp]: (value) => parseStampValue(value, false),
  [StampMilli]: (value) => parseStampValue(value, true)
};

function createTimeWithMonotonic(
  epochMilliseconds: bigint,
  loc: Location,
  monotonicMilliseconds: bigint | undefined
): Time {
  const time = new Time(epochMilliseconds, loc);
  (time as unknown as { monotonicMilliseconds: bigint | undefined }).monotonicMilliseconds =
    monotonicMilliseconds;
  return time;
}

function normalizeDateFields(
  args: [DateFields] | [number, Month, number, number, number, number, number, Location?]
): DateFields {
  if (typeof args[0] === "object") {
    return args[0];
  }

  const [year, month, day, hour, minute, second, millisecond, location] = args as [
    number,
    Month,
    number,
    number,
    number,
    number,
    number,
    Location?
  ];
  return location === undefined
    ? { year, month, day, hour, minute, second, millisecond }
    : { year, month, day, hour, minute, second, millisecond, location };
}

function formatRfc3339(time: Time): string {
  const location = time.location();
  if (location.name === "UTC" || (location.fixedOffsetSeconds === 0 && location.name !== "Local")) {
    const seconds = time.unixMilli() / MILLISECONDS_PER_SECOND;
    const subSecondMilliseconds = time.unixMilli() % MILLISECONDS_PER_SECOND;
    const normalizedSubSecondMilliseconds =
      subSecondMilliseconds < 0n
        ? subSecondMilliseconds + MILLISECONDS_PER_SECOND
        : subSecondMilliseconds;
    const utcDate = new Date(Number(seconds * 1000n));
    const datePart = `${utcDate.getUTCFullYear()}-${pad2(utcDate.getUTCMonth() + 1)}-${pad2(utcDate.getUTCDate())}`;
    const timePart = `${pad2(utcDate.getUTCHours())}:${pad2(utcDate.getUTCMinutes())}:${pad2(utcDate.getUTCSeconds())}`;
    const ms = Number(normalizedSubSecondMilliseconds);
    return ms > 0
      ? `${datePart}T${timePart}.${ms.toString().padStart(3, "0")}Z`
      : `${datePart}T${timePart}Z`;
  }

  const local = getLocalComponents(time.unixMilli(), location);
  const datePart = `${local.year}-${pad2(local.month)}-${pad2(local.day)}`;
  const baseTime = `${pad2(local.hour)}:${pad2(local.minute)}:${pad2(local.second)}`;
  const subSecondMilliseconds = time.unixMilli() % MILLISECONDS_PER_SECOND;
  const normalizedSubSecondMilliseconds =
    subSecondMilliseconds < 0n
      ? subSecondMilliseconds + MILLISECONDS_PER_SECOND
      : subSecondMilliseconds;
  const ms = Number(normalizedSubSecondMilliseconds);
  const timePart = ms > 0 ? `${baseTime}.${ms.toString().padStart(3, "0")}` : baseTime;
  return `${datePart}T${timePart}${formatOffsetRfc3339(local.offset)}`;
}

function formatDateOnly(time: Time): string {
  const local = getLocalComponents(time.unixMilli(), time.location());
  return `${local.year}-${pad2(local.month)}-${pad2(local.day)}`;
}

function formatTimeOnly(time: Time): string {
  const local = getLocalComponents(time.unixMilli(), time.location());
  return `${pad2(local.hour)}:${pad2(local.minute)}:${pad2(local.second)}`;
}

function formatAnsic(time: Time): string {
  return `${weekdayShortName(time.weekday())} ${monthShortName(time.month())} ${padSpace(time.day(), 2)} ${pad2(time.hour())}:${pad2(time.minute())}:${pad2(time.second())} ${time.year()}`;
}

function formatUnixDate(time: Time): string {
  const { name, offsetSeconds } = time.zone();
  return `${weekdayShortName(time.weekday())} ${monthShortName(time.month())} ${padSpace(time.day(), 2)} ${pad2(time.hour())}:${pad2(time.minute())}:${pad2(time.second())} ${zoneToken(name, offsetSeconds)} ${time.year()}`;
}

function formatRubyDate(time: Time): string {
  const { offsetSeconds } = time.zone();
  return `${weekdayShortName(time.weekday())} ${monthShortName(time.month())} ${pad2(time.day())} ${pad2(time.hour())}:${pad2(time.minute())}:${pad2(time.second())} ${formatOffset(offsetSeconds)} ${time.year()}`;
}

function formatRfc822(time: Time): string {
  const { name, offsetSeconds } = time.zone();
  return `${pad2(time.day())} ${monthShortName(time.month())} ${pad2(time.year() % 100)} ${pad2(time.hour())}:${pad2(time.minute())} ${zoneToken(name, offsetSeconds)}`;
}

function formatRfc822Z(time: Time): string {
  const { offsetSeconds } = time.zone();
  return `${pad2(time.day())} ${monthShortName(time.month())} ${pad2(time.year() % 100)} ${pad2(time.hour())}:${pad2(time.minute())} ${formatOffset(offsetSeconds)}`;
}

function formatRfc850(time: Time): string {
  const { name, offsetSeconds } = time.zone();
  return `${weekdayLongName(time.weekday())}, ${pad2(time.day())}-${monthShortName(time.month())}-${pad2(time.year() % 100)} ${pad2(time.hour())}:${pad2(time.minute())}:${pad2(time.second())} ${zoneToken(name, offsetSeconds)}`;
}

function formatRfc1123(time: Time): string {
  const { name, offsetSeconds } = time.zone();
  return `${weekdayShortName(time.weekday())}, ${pad2(time.day())} ${monthShortName(time.month())} ${time.year()} ${pad2(time.hour())}:${pad2(time.minute())}:${pad2(time.second())} ${zoneToken(name, offsetSeconds)}`;
}

function formatRfc1123Z(time: Time): string {
  const { offsetSeconds } = time.zone();
  return `${weekdayShortName(time.weekday())}, ${pad2(time.day())} ${monthShortName(time.month())} ${time.year()} ${pad2(time.hour())}:${pad2(time.minute())}:${pad2(time.second())} ${formatOffset(offsetSeconds)}`;
}

function formatKitchen(time: Time): string {
  const hour = time.hour();
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${time.minute().toString().padStart(2, "0")}${ampm}`;
}

function formatStamp(time: Time): string {
  return `${monthShortName(time.month())} ${padSpace(time.day(), 2)} ${pad2(time.hour())}:${pad2(time.minute())}:${pad2(time.second())}`;
}

function formatStampMilli(time: Time): string {
  return `${formatStamp(time)}.${time.millisecond().toString().padStart(3, "0")}`;
}

function formatDateTime(time: Time): string {
  const local = getLocalComponents(time.unixMilli(), time.location());
  return `${local.year}-${pad2(local.month)}-${pad2(local.day)} ${pad2(local.hour)}:${pad2(local.minute)}:${pad2(local.second)}`;
}

function parseWithDateParse(value: string): Time {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  return new Time(BigInt(ms), UTC);
}

function parseRfc3339Value(value: string): Time {
  return parseWithDateParse(value);
}

function parseDateOnlyValue(value: string): Time {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  const parts: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0
  };
  return new Time(BigInt(createUtcTimestamp(parts, value)), UTC);
}

function parseDateTimeValue(value: string): Time {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  const parts: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
    millisecond: 0
  };
  return new Time(BigInt(createUtcTimestamp(parts, value)), UTC);
}

function parseAnsicValue(value: string): Time {
  const match = /^(\w{3})\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/.exec(value);
  if (!match) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  const month = monthFromShortName(match[2]!);
  if (!month) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  const parts: DateTimeParts = {
    year: Number(match[7]),
    month,
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
    millisecond: 0
  };
  return new Time(BigInt(createUtcTimestamp(parts, value)), UTC);
}

function parseDateParseValue(value: string): Time {
  return parseWithDateParse(value);
}

function parseTimeOnlyValue(value: string): ClockParts {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  return {
    hour: parseTimeComponent(match[1]!, 0, 23, value),
    minute: parseTimeComponent(match[2]!, 0, 59, value),
    second: parseTimeComponent(match[3]!, 0, 59, value)
  };
}

function parseTimeOnly(value: string): Time {
  const parts = parseTimeOnlyValue(value);
  return new Time(BigInt(Date.UTC(0, 0, 1, parts.hour, parts.minute, parts.second, 0)), UTC);
}

function parseKitchenValue(value: string): ClockParts {
  const match = /^(\d{1,2}):(\d{2})(AM|PM)$/.exec(value);
  if (!match) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  const rawHour = parseTimeComponent(match[1]!, 1, 12, value);
  return {
    hour: match[3] === "PM" ? (rawHour % 12) + 12 : rawHour % 12,
    minute: parseTimeComponent(match[2]!, 0, 59, value),
    second: 0
  };
}

function parseKitchen(value: string): Time {
  const parts = parseKitchenValue(value);
  return new Time(BigInt(Date.UTC(0, 0, 1, parts.hour, parts.minute, 0, 0)), UTC);
}

function parseStampValue(value: string, withMilliseconds: boolean): Time {
  const pattern = withMilliseconds
    ? /^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/
    : /^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})$/;
  const match = pattern.exec(value);
  if (!match) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  const month = monthFromShortName(match[1]!);
  if (!month) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  const parts: DateTimeParts = {
    year: 1900,
    month,
    day: parseTimeComponent(match[2]!, 1, 31, value),
    hour: parseTimeComponent(match[3]!, 0, 23, value),
    minute: parseTimeComponent(match[4]!, 0, 59, value),
    second: parseTimeComponent(match[5]!, 0, 59, value),
    millisecond: parseTimeComponent(match[6] ?? "0", 0, 999, value)
  };
  return new Time(BigInt(createUtcTimestamp(parts, value)), UTC);
}

function parseTimeComponent(raw: string, min: number, max: number, value: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  return parsed;
}

function assertValidDateTimeParts(parts: DateTimeParts, value: string): void {
  const { year, month, day, hour, minute, second, millisecond } = parts;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    !Number.isInteger(millisecond)
  ) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  if (month < 1 || month > 12) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
  if (millisecond < 0 || millisecond > 999 || day < 1 || day > 31) {
    throw new TypeError(`cannot parse time: ${value}`);
  }

  const candidate = new Date(Date.UTC(0, month - 1, day, hour, minute, second, millisecond));
  candidate.setUTCFullYear(year);
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day ||
    candidate.getUTCHours() !== hour ||
    candidate.getUTCMinutes() !== minute ||
    candidate.getUTCSeconds() !== second ||
    candidate.getUTCMilliseconds() !== millisecond
  ) {
    throw new TypeError(`cannot parse time: ${value}`);
  }
}

function createUtcTimestamp(parts: DateTimeParts, value: string): number {
  assertValidDateTimeParts(parts, value);
  const { year, month, day, hour, minute, second, millisecond } = parts;
  const date = new Date(Date.UTC(0, month - 1, day, hour, minute, second, millisecond));
  date.setUTCFullYear(year);
  return date.getTime();
}

export { parseDuration } from "./duration.js";
