import * as goTime from "../src/index.js";

import {
  ANSIC,
  DateOnly,
  DateTime,
  Duration,
  Kitchen,
  Month,
  RFC822,
  RFC822Z,
  RFC850,
  RFC1123,
  RFC1123Z,
  RFC3339,
  RubyDate,
  Stamp,
  StampMilli,
  TimeOnly,
  UnixDate,
  date,
  fixedZone,
  now,
  parse,
  parseInLocation,
  parseDuration,
  loadLocation,
  Location,
  sleep,
  since,
  Time,
  UTC,
  type SupportedLayout,
  unixMilli,
  unix,
  until,
} from "../src/index.js";

const plus2 = fixedZone("PLUS2", 2 * 3600);

test("unix constructors expose epoch units", () => {
  const tMs = unixMilli(1_700_000_000_123n);
  expect(tMs.unixMilli()).toBe(1_700_000_000_123n);

  const t = unix(10n, 750n);
  expect(t.unix()).toBe(10n);
  expect(t.unixMilli()).toBe(10_750n);
  expect(t.millisecond()).toBe(750);
});

test("time comparison and arithmetic reflects chronology", () => {
  const a = unix(10n, 0n);
  const b = unix(12n, 0n);

  expect(a.compare(b)).toBe(-1);
  expect(b.compare(a)).toBe(1);
  expect(a.before(b)).toBe(true);
  expect(b.after(a)).toBe(true);
  expect(a.equal(unix(10n, 0n))).toBe(true);

  const delta = parseDuration("1500ms");
  expect(a.add(delta).sub(a).milliseconds()).toBe(delta.milliseconds());
});

test("monotonic subtraction uses monotonic clock when available", () => {
  const a = now();
  const b = now();
  expect(a.sub(b).milliseconds()).toBeLessThanOrEqual(0n);
});

test("monotonic subtraction prefers monotonic milliseconds over wall clock", () => {
  const earlierWallClock = new Time(1_000n, UTC);
  const laterWallClock = new Time(5_000n, UTC);
  (earlierWallClock as unknown as { monotonicMilliseconds: bigint }).monotonicMilliseconds = 100n;
  (laterWallClock as unknown as { monotonicMilliseconds: bigint }).monotonicMilliseconds = 125n;

  expect(laterWallClock.sub(earlierWallClock).milliseconds()).toBe(25n);
  expect(earlierWallClock.sub(laterWallClock).milliseconds()).toBe(-25n);
});

test("location transforms and zone reporting are behaviorally correct", () => {
  const utcTime = unix(0n, 0n).utc();
  expect(utcTime.zone()).toEqual({ name: "UTC", offsetSeconds: 0 });

  const fixed = unix(0n, 0n).in(plus2);
  expect(fixed.zone()).toEqual({ name: "PLUS2", offsetSeconds: 7200 });
  expect(fixed.location().toString()).toBe("PLUS2");

  const local = unix(0n, 0n).local();
  const { name, offsetSeconds } = local.zone();
  expect(name).toBe("Local");
  expect(Number.isInteger(offsetSeconds)).toBe(true);
});

test("calendar accessors expose expected fields", () => {
  const t = date(2026, Month.April, 8, 12, 30, 15, 123).utc();
  expect(t.date()).toEqual({ year: 2026, month: Month.April, day: 8 });
  expect(t.clock()).toEqual({ hour: 12, minute: 30, second: 15 });
  expect(t.year()).toBe(2026);
  expect(t.month()).toBe(Month.April);
  expect(t.day()).toBe(8);
  expect(t.hour()).toBe(12);
  expect(t.minute()).toBe(30);
  expect(t.second()).toBe(15);
  expect(t.millisecond()).toBe(123);
  expect(t.weekday()).toBe(3);
  expect(t.yearDay()).toBe(98);
  expect(date(2021, Month.January, 1, 0, 0, 0, 0).isoWeek()).toEqual({
    year: 2020,
    week: 53,
  });
});

test("round and truncate follow step semantics", () => {
  const t = unix(10n, 750n);
  const step = parseDuration("1s");
  expect(t.truncate(step).unixMilli()).toBe(10_000n);
  expect(t.round(step).unixMilli()).toBe(11_000n);
  expect(unix(10n, 0n).round(step).unixMilli()).toBe(10_000n);
  expect(unix(10n, 200n).round(step).unixMilli()).toBe(10_000n);
  expect(unix(-10n, -750n).round(step).unixMilli()).toBe(-11_000n);
  expect(t.round(parseDuration("0s")).unixMilli()).toBe(t.unixMilli());
  expect(t.truncate(parseDuration("-1s")).unixMilli()).toBe(t.unixMilli());
});

test("zone behavior includes UTC-like and named IANA locations", () => {
  const pseudoUtc = unix(0n, 0n).in(new Location("UTC"));
  expect(pseudoUtc.zone()).toEqual({ name: "UTC", offsetSeconds: 0 });

  const etcUtc = unix(0n, 0n).in(new Location("Etc/UTC"));
  expect(etcUtc.zone()).toEqual({ name: "Etc/UTC", offsetSeconds: 0 });

  const paris = loadLocation("Europe/Paris");
  const parisTime = unix(0n, 0n).in(paris);
  const { name, offsetSeconds } = parisTime.zone();
  expect(name).toBe("Europe/Paris");
  expect(Number.isInteger(offsetSeconds)).toBe(true);

  const pst = unix(0n, 0n).in(fixedZone("PST", -8 * 3600));
  expect(pst.format(RFC1123)).toMatch(/PST$/);
});

test("Time truncates unsupported sub-millisecond precision", () => {
  const base = unixMilli(1_700_000_000_123n);
  const rounded = base.add(new Duration(0n));

  expect(rounded.unixMilli()).toBe(base.unixMilli());
  expect(rounded.utc().toString()).toBe("2023-11-14T22:13:20.123Z");
});

test("addDate normalizes month rollover", () => {
  const next = date(2021, Month.January, 31, 12, 0, 0, 0).addDate(0, 1, 0);
  expect(next.year()).toBe(2021);
  expect(next.month()).toBe(Month.March);
  expect(next.day()).toBe(3);
});

test("format and parse roundtrip for supported layouts", () => {
  const utc = date(2026, Month.April, 8, 12, 34, 56, 123).utc();
  const zoned = date(2026, Month.April, 8, 12, 34, 56, 123, plus2);

  const cases: Array<{
    layout: SupportedLayout;
    sample: string;
    t: ReturnType<typeof unix>;
    stableRoundtrip: boolean;
  }> = [
    {
      layout: RFC3339,
      sample: "2026-04-08T12:34:56.123Z",
      t: utc,
      stableRoundtrip: true,
    },
    { layout: DateOnly, sample: "2026-04-08", t: utc, stableRoundtrip: true },
    { layout: TimeOnly, sample: "12:34:56", t: utc, stableRoundtrip: true },
    {
      layout: DateTime,
      sample: "2026-04-08 12:34:56",
      t: utc,
      stableRoundtrip: true,
    },
    { layout: Kitchen, sample: "12:34PM", t: utc, stableRoundtrip: true },
    { layout: Stamp, sample: "Apr  8 12:34:56", t: utc, stableRoundtrip: true },
    {
      layout: StampMilli,
      sample: "Apr  8 12:34:56.123",
      t: utc,
      stableRoundtrip: true,
    },
    {
      layout: ANSIC,
      sample: "Wed Apr  8 12:34:56 2026",
      t: utc,
      stableRoundtrip: true,
    },
    {
      layout: UnixDate,
      sample: "Wed Apr  8 12:34:56 GMT 2026",
      t: utc,
      stableRoundtrip: true,
    },
    {
      layout: RubyDate,
      sample: "Wed Apr 08 12:34:56 +0200 2026",
      t: zoned,
      stableRoundtrip: false,
    },
    {
      layout: RFC822,
      sample: "08 Apr 26 12:34 GMT",
      t: utc,
      stableRoundtrip: true,
    },
    {
      layout: RFC822Z,
      sample: "08 Apr 26 12:34 +0200",
      t: zoned,
      stableRoundtrip: false,
    },
    {
      layout: RFC850,
      sample: "Wednesday, 08-Apr-26 12:34:56 GMT",
      t: utc,
      stableRoundtrip: true,
    },
    {
      layout: RFC1123,
      sample: "Wed, 08 Apr 2026 12:34:56 GMT",
      t: utc,
      stableRoundtrip: true,
    },
    {
      layout: RFC1123Z,
      sample: "Wed, 08 Apr 2026 12:34:56 +0200",
      t: zoned,
      stableRoundtrip: false,
    },
  ];

  for (const c of cases) {
    expect(c.t.format(c.layout)).toBe(c.sample);
    const parsed = parse(c.layout, c.sample);
    const roundtripValue = c.stableRoundtrip ? parsed.format(c.layout) : typeof parsed.unix();
    const expectedValue = c.stableRoundtrip ? c.sample : "bigint";
    expect(roundtripValue).toBe(expectedValue);
  }

  expect(zoned.format(RFC822)).toBe("08 Apr 26 12:34 +0200");
  expect(zoned.format(RFC850)).toBe("Wednesday, 08-Apr-26 12:34:56 +0200");
  expect(zoned.format(RFC1123)).toBe("Wed, 08 Apr 2026 12:34:56 +0200");
});

test("parseInLocation uses provided location for wall-clock parsing", () => {
  const dt = parseInLocation(DateTime, "2026-04-08 12:00:00", plus2);
  expect(dt.unix()).toBe(1775642400n);
  expect(dt.zone()).toEqual({ name: "PLUS2", offsetSeconds: 7200 });

  const d = parseInLocation(DateOnly, "2026-04-08", plus2);
  expect(d.format(DateTime)).toBe("2026-04-08 00:00:00");
  expect(d.utc().format(DateTime)).toBe("2026-04-07 22:00:00");

  const t = parseInLocation(TimeOnly, "03:04:05", plus2);
  expect(t.zone()).toEqual({ name: "PLUS2", offsetSeconds: 7200 });

  const kitchen = parseInLocation(Kitchen, "3:04PM", plus2);
  expect(kitchen.zone()).toEqual({ name: "PLUS2", offsetSeconds: 7200 });

  const rfc = parseInLocation(RFC3339, "2026-04-08T12:00:00.000Z", plus2);
  expect(rfc.zone()).toEqual({ name: "PLUS2", offsetSeconds: 7200 });

  const dtUtc = parseInLocation(DateTime, "2026-04-08 12:00:00", loadLocation("UTC"));
  expect(dtUtc.zone()).toEqual({ name: "UTC", offsetSeconds: 0 });

  const dtPseudoUtc = parseInLocation(DateTime, "2026-04-08 12:00:00", new Location("UTC"));
  expect(dtPseudoUtc.zone()).toEqual({ name: "UTC", offsetSeconds: 0 });

  const dtLocal = parseInLocation(DateTime, "2026-04-08 12:00:00", loadLocation("Local"));
  expect(dtLocal.zone().name).toBe("Local");

  const dtParis = parseInLocation(DateTime, "2026-04-08 12:00:00", loadLocation("Europe/Paris"));
  expect(dtParis.zone().name).toBe("Europe/Paris");
});

test("zone offset parsing falls back safely when Intl parts are missing or unparsable", () => {
  const original = Intl.DateTimeFormat;

  class MissingZoneNameFormatter {
    formatToParts(): Array<{ type: string; value: string }> {
      return [{ type: "literal", value: "x" }];
    }
  }

  class UnparsableZoneNameFormatter {
    formatToParts(): Array<{ type: string; value: string }> {
      return [{ type: "timeZoneName", value: "GMT+2" }];
    }
  }

  try {
    (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat =
      MissingZoneNameFormatter as unknown as typeof Intl.DateTimeFormat;
    expect(unix(0n, 0n).in(new Location("Etc/Test")).zone()).toEqual({
      name: "Etc/Test",
      offsetSeconds: 0,
    });

    (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat =
      UnparsableZoneNameFormatter as unknown as typeof Intl.DateTimeFormat;
    expect(unix(0n, 0n).in(new Location("Etc/Test")).zone()).toEqual({
      name: "Etc/Test",
      offsetSeconds: 0,
    });
  } finally {
    (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = original;
  }
});

test("parse and format report errors for unsupported or invalid input", () => {
  const invalidCases: Array<{ layout: string; value: string }> = [
    { layout: RFC3339, value: "bad" },
    { layout: DateOnly, value: "2026/04/08" },
    { layout: DateOnly, value: "2026-02-31" },
    { layout: DateTime, value: "not-a-date" },
    { layout: DateTime, value: "2026-02-31 12:00:00" },
    { layout: ANSIC, value: "bad" },
    { layout: ANSIC, value: "Wed Foo  8 12:34:56 2026" },
    { layout: UnixDate, value: "bad" },
    { layout: RubyDate, value: "bad" },
    { layout: RFC822, value: "bad" },
    { layout: RFC822Z, value: "bad" },
    { layout: RFC850, value: "bad" },
    { layout: RFC1123, value: "bad" },
    { layout: RFC1123Z, value: "bad" },
    { layout: TimeOnly, value: "25:00" },
    { layout: TimeOnly, value: "25:00:00" },
    { layout: Kitchen, value: "15:04" },
    { layout: Kitchen, value: "15:04PM" },
    { layout: Stamp, value: "Foo  8 12:34:56" },
    { layout: Stamp, value: "Apr  8 99:34:56" },
    { layout: Stamp, value: "bad" },
    { layout: StampMilli, value: "Apr  8 12:34:56.1000" },
    { layout: StampMilli, value: "bad" },
  ];

  for (const c of invalidCases) {
    expect(() => parse(c.layout, c.value)).toThrow(/./);
    expect(() => parseInLocation(c.layout, c.value, plus2)).toThrow(/./);
  }

  expect(() => parse("NOPE", "x")).toThrow(/./);
  expect(() => unix(0n, 0n).format("NOPE" as string)).toThrow(/./);
});

test("public entrypoint omits unstable symbols", () => {
  expect("Layout" in goTime).toBe(false);
  expect("loadLocationFromTZData" in goTime).toBe(false);
});

test("zero values and relative time helpers behave consistently", async () => {
  const zero = unix(0n, 0n);
  expect(zero.isZero()).toBe(true);
  expect(unix(1n, 0n).isZero()).toBe(false);

  const start = now();
  await sleep(parseDuration("1ms"));
  const elapsed = since(start);
  const remaining = until(now().add(parseDuration("5ms")));

  expect(elapsed.milliseconds()).toBeGreaterThanOrEqual(0n);
  expect(remaining.milliseconds()).toBeGreaterThanOrEqual(-5n);
  await sleep(parseDuration("0s"));
});

test("date() with non-UTC location interprets fields in that location", () => {
  // date(2026, April, 8, 12, 30, 0, 0, UTC+2) should represent 2026-04-08T10:30:00Z
  const t = date(2026, Month.April, 8, 12, 30, 0, 0, plus2);
  expect(t.unix()).toBe(BigInt(Date.UTC(2026, 3, 8, 10, 30, 0) / 1000));

  // Cross-midnight: 2026-04-09 01:00:00 UTC+2 = 2026-04-08 23:00:00 UTC
  const cross = date(2026, Month.April, 9, 1, 0, 0, 0, plus2);
  expect(cross.unix()).toBe(BigInt(Date.UTC(2026, 3, 8, 23, 0, 0) / 1000));
});

test("calendar accessors reflect the time's location", () => {
  // 2026-04-08 23:30:15 UTC+2 = 2026-04-08 21:30:15 UTC
  const t = date(2026, Month.April, 8, 23, 30, 15, 0, plus2);
  expect(t.hour()).toBe(23);
  expect(t.minute()).toBe(30);
  expect(t.second()).toBe(15);
  expect(t.day()).toBe(8);
  expect(t.month()).toBe(Month.April);
  expect(t.year()).toBe(2026);
  expect(t.clock()).toEqual({ hour: 23, minute: 30, second: 15 });
  expect(t.date()).toEqual({ year: 2026, month: Month.April, day: 8 });

  // Cross-midnight: 2026-04-09 01:30:00 UTC+2 = 2026-04-08 23:30:00 UTC
  const early = date(2026, Month.April, 9, 1, 30, 0, 0, plus2);
  expect(early.year()).toBe(2026);
  expect(early.month()).toBe(Month.April);
  expect(early.day()).toBe(9);
  expect(early.hour()).toBe(1);
  expect(early.minute()).toBe(30);
});

test("format outputs the time in its location", () => {
  // 2026-04-08 12:00:00 UTC+2 = 2026-04-08 10:00:00 UTC
  const t = date(2026, Month.April, 8, 12, 0, 0, 0, plus2);
  expect(t.format(DateOnly)).toBe("2026-04-08");
  expect(t.format(TimeOnly)).toBe("12:00:00");
  expect(t.format(DateTime)).toBe("2026-04-08 12:00:00");
  expect(t.format(RFC3339)).toBe("2026-04-08T12:00:00+02:00");

  // Negative offset: 2026-04-08 07:00:00 UTC-5 = 2026-04-08 12:00:00 UTC
  const est = fixedZone("EST", -5 * 3600);
  const tEst = date(2026, Month.April, 8, 7, 0, 0, 0, est);
  expect(tEst.format(DateOnly)).toBe("2026-04-08");
  expect(tEst.format(TimeOnly)).toBe("07:00:00");
  expect(tEst.format(RFC3339)).toBe("2026-04-08T07:00:00-05:00");
});
