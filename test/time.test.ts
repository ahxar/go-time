import test from "node:test";
import assert from "node:assert/strict";

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
  unixMilli,
  unix,
  until
} from "../src/index.js";

const plus2 = fixedZone("PLUS2", 2 * 3600);

test("unix constructors expose epoch units", () => {
  const tMs = unixMilli(1_700_000_000_123n);
  assert.equal(tMs.unixMilli(), 1_700_000_000_123n);

  const t = unix(10n, 750n);
  assert.equal(t.unix(), 10n);
  assert.equal(t.unixMilli(), 10_750n);
  assert.equal(t.millisecond(), 750);
});

test("time comparison and arithmetic reflects chronology", () => {
  const a = unix(10n, 0n);
  const b = unix(12n, 0n);

  assert.equal(a.compare(b), -1);
  assert.equal(b.compare(a), 1);
  assert.equal(a.before(b), true);
  assert.equal(b.after(a), true);
  assert.equal(a.equal(unix(10n, 0n)), true);

  const delta = parseDuration("1500ms");
  assert.equal(a.add(delta).sub(a).milliseconds(), delta.milliseconds());
});

test("monotonic subtraction uses monotonic clock when available", () => {
  const a = now();
  const b = now();
  assert.ok(a.sub(b).milliseconds() <= 0n);
});

test("monotonic subtraction prefers monotonic milliseconds over wall clock", () => {
  const earlierWallClock = new Time(1_000n, UTC, 100n);
  const laterWallClock = new Time(5_000n, UTC, 125n);

  assert.equal(laterWallClock.sub(earlierWallClock).milliseconds(), 25n);
  assert.equal(earlierWallClock.sub(laterWallClock).milliseconds(), -25n);
});

test("location transforms and zone reporting are behaviorally correct", () => {
  const utcTime = unix(0n, 0n).utc();
  assert.deepEqual(utcTime.zone(), ["UTC", 0]);

  const fixed = unix(0n, 0n).in(plus2);
  assert.deepEqual(fixed.zone(), ["PLUS2", 7200]);
  assert.equal(fixed.location().toString(), "PLUS2");

  const local = unix(0n, 0n).local();
  const [name, offset] = local.zone();
  assert.equal(name, "Local");
  assert.equal(Number.isInteger(offset), true);
});

test("calendar accessors expose expected fields", () => {
  const t = date(2026, Month.April, 8, 12, 30, 15, 123).utc();
  assert.deepEqual(t.date(), [2026, Month.April, 8]);
  assert.deepEqual(t.clock(), [12, 30, 15]);
  assert.equal(t.year(), 2026);
  assert.equal(t.month(), Month.April);
  assert.equal(t.day(), 8);
  assert.equal(t.hour(), 12);
  assert.equal(t.minute(), 30);
  assert.equal(t.second(), 15);
  assert.equal(t.millisecond(), 123);
  assert.equal(t.weekday(), 3);
  assert.equal(t.yearDay(), 98);
  assert.deepEqual(date(2021, Month.January, 1, 0, 0, 0, 0).isoWeek(), [2020, 53]);
});

test("round and truncate follow step semantics", () => {
  const t = unix(10n, 750n);
  const step = parseDuration("1s");
  assert.equal(t.truncate(step).unixMilli(), 10_000n);
  assert.equal(t.round(step).unixMilli(), 11_000n);
  assert.equal(unix(10n, 0n).round(step).unixMilli(), 10_000n);
  assert.equal(unix(10n, 200n).round(step).unixMilli(), 10_000n);
  assert.equal(unix(-10n, -750n).round(step).unixMilli(), -11_000n);
  assert.equal(t.round(parseDuration("0s")).unixMilli(), t.unixMilli());
  assert.equal(t.truncate(parseDuration("-1s")).unixMilli(), t.unixMilli());
});

test("zone behavior includes UTC-like and named IANA locations", () => {
  const pseudoUtc = unix(0n, 0n).in(new Location("UTC"));
  assert.deepEqual(pseudoUtc.zone(), ["UTC", 0]);

  const etcUtc = unix(0n, 0n).in(new Location("Etc/UTC"));
  assert.deepEqual(etcUtc.zone(), ["Etc/UTC", 0]);

  const paris = loadLocation("Europe/Paris");
  const parisTime = unix(0n, 0n).in(paris);
  const [name, offset] = parisTime.zone();
  assert.equal(name, "Europe/Paris");
  assert.equal(Number.isInteger(offset), true);

  const pst = unix(0n, 0n).in(fixedZone("PST", -8 * 3600));
  assert.match(pst.format(RFC1123), /PST$/);
});

test("Time truncates unsupported sub-millisecond precision", () => {
  const base = unixMilli(1_700_000_000_123n);
  const rounded = base.add(new Duration(0n));

  assert.equal(rounded.unixMilli(), base.unixMilli());
  assert.equal(rounded.utc().toString(), "2023-11-14T22:13:20.123Z");
});

test("addDate normalizes month rollover", () => {
  const next = date(2021, Month.January, 31, 12, 0, 0, 0).addDate(0, 1, 0);
  assert.equal(next.year(), 2021);
  assert.equal(next.month(), Month.March);
  assert.equal(next.day(), 3);
});

test("format and parse roundtrip for supported layouts", () => {
  const utc = date(2026, Month.April, 8, 12, 34, 56, 123).utc();
  const zoned = date(2026, Month.April, 8, 12, 34, 56, 123, plus2);

  const cases: Array<{
    layout: string;
    sample: string;
    t: ReturnType<typeof unix>;
    stableRoundtrip: boolean;
  }> = [
    { layout: RFC3339, sample: "2026-04-08T12:34:56.123Z", t: utc, stableRoundtrip: true },
    { layout: DateOnly, sample: "2026-04-08", t: utc, stableRoundtrip: true },
    { layout: TimeOnly, sample: "12:34:56", t: utc, stableRoundtrip: true },
    { layout: DateTime, sample: "2026-04-08 12:34:56", t: utc, stableRoundtrip: true },
    { layout: Kitchen, sample: "12:34PM", t: utc, stableRoundtrip: true },
    { layout: Stamp, sample: "Apr  8 12:34:56", t: utc, stableRoundtrip: true },
    { layout: StampMilli, sample: "Apr  8 12:34:56.123", t: utc, stableRoundtrip: true },
    { layout: ANSIC, sample: "Wed Apr  8 12:34:56 2026", t: utc, stableRoundtrip: true },
    { layout: UnixDate, sample: "Wed Apr  8 12:34:56 GMT 2026", t: utc, stableRoundtrip: true },
    {
      layout: RubyDate,
      sample: "Wed Apr 08 12:34:56 +0200 2026",
      t: zoned,
      stableRoundtrip: false
    },
    { layout: RFC822, sample: "08 Apr 26 12:34 GMT", t: utc, stableRoundtrip: true },
    { layout: RFC822Z, sample: "08 Apr 26 12:34 +0200", t: zoned, stableRoundtrip: false },
    { layout: RFC850, sample: "Wednesday, 08-Apr-26 12:34:56 GMT", t: utc, stableRoundtrip: true },
    { layout: RFC1123, sample: "Wed, 08 Apr 2026 12:34:56 GMT", t: utc, stableRoundtrip: true },
    {
      layout: RFC1123Z,
      sample: "Wed, 08 Apr 2026 12:34:56 +0200",
      t: zoned,
      stableRoundtrip: false
    }
  ];

  for (const c of cases) {
    assert.equal(c.t.format(c.layout), c.sample, c.layout);
    const parsed = parse(c.layout, c.sample);
    if (c.stableRoundtrip) {
      assert.equal(parsed.format(c.layout), c.sample, c.layout);
    } else {
      assert.equal(typeof parsed.unix(), "bigint", c.layout);
    }
  }

  assert.equal(zoned.format(RFC822), "08 Apr 26 12:34 +0200");
  assert.equal(zoned.format(RFC850), "Wednesday, 08-Apr-26 12:34:56 +0200");
  assert.equal(zoned.format(RFC1123), "Wed, 08 Apr 2026 12:34:56 +0200");
});

test("parseInLocation uses provided location for wall-clock parsing", () => {
  const dt = parseInLocation(DateTime, "2026-04-08 12:00:00", plus2);
  assert.equal(dt.unix(), 1775642400n);
  assert.deepEqual(dt.zone(), ["PLUS2", 7200]);

  const d = parseInLocation(DateOnly, "2026-04-08", plus2);
  assert.equal(d.format(DateTime), "2026-04-08 00:00:00");
  assert.equal(d.utc().format(DateTime), "2026-04-07 22:00:00");

  const t = parseInLocation(TimeOnly, "03:04:05", plus2);
  assert.deepEqual(t.zone(), ["PLUS2", 7200]);

  const kitchen = parseInLocation(Kitchen, "3:04PM", plus2);
  assert.deepEqual(kitchen.zone(), ["PLUS2", 7200]);

  const rfc = parseInLocation(RFC3339, "2026-04-08T12:00:00.000Z", plus2);
  assert.deepEqual(rfc.zone(), ["PLUS2", 7200]);

  const dtUtc = parseInLocation(DateTime, "2026-04-08 12:00:00", loadLocation("UTC"));
  assert.deepEqual(dtUtc.zone(), ["UTC", 0]);

  const dtPseudoUtc = parseInLocation(DateTime, "2026-04-08 12:00:00", new Location("UTC"));
  assert.deepEqual(dtPseudoUtc.zone(), ["UTC", 0]);

  const dtLocal = parseInLocation(DateTime, "2026-04-08 12:00:00", loadLocation("Local"));
  assert.equal(dtLocal.zone()[0], "Local");

  const dtParis = parseInLocation(DateTime, "2026-04-08 12:00:00", loadLocation("Europe/Paris"));
  assert.equal(dtParis.zone()[0], "Europe/Paris");
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
    assert.deepEqual(unix(0n, 0n).in(new Location("Etc/Test")).zone(), ["Etc/Test", 0]);

    (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat =
      UnparsableZoneNameFormatter as unknown as typeof Intl.DateTimeFormat;
    assert.deepEqual(unix(0n, 0n).in(new Location("Etc/Test")).zone(), ["Etc/Test", 0]);
  } finally {
    (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = original;
  }
});

test("parse and format report errors for unsupported or invalid input", () => {
  const invalidCases: Array<{ layout: string; value: string }> = [
    { layout: RFC3339, value: "bad" },
    { layout: DateOnly, value: "2026/04/08" },
    { layout: DateTime, value: "not-a-date" },
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
    { layout: Kitchen, value: "15:04" },
    { layout: Stamp, value: "Foo  8 12:34:56" },
    { layout: Stamp, value: "bad" },
    { layout: StampMilli, value: "bad" }
  ];

  for (const c of invalidCases) {
    assert.throws(() => parse(c.layout, c.value), c.layout);
    assert.throws(() => parseInLocation(c.layout, c.value, plus2), c.layout);
  }

  assert.throws(() => parse("NOPE", "x"));
  assert.throws(() => unix(0n, 0n).format("NOPE"));
});

test("zero values and relative time helpers behave consistently", async () => {
  const zero = unix(0n, 0n);
  assert.equal(zero.isZero(), true);
  assert.equal(unix(1n, 0n).isZero(), false);

  const start = now();
  await sleep(parseDuration("1ms"));
  const elapsed = since(start);
  const remaining = until(now().add(parseDuration("5ms")));

  assert.ok(elapsed.milliseconds() >= 0n);
  assert.ok(remaining.milliseconds() >= -5n);
  await sleep(parseDuration("0s"));
});

test("date() with non-UTC location interprets fields in that location", () => {
  // date(2026, April, 8, 12, 30, 0, 0, UTC+2) should represent 2026-04-08T10:30:00Z
  const t = date(2026, Month.April, 8, 12, 30, 0, 0, plus2);
  assert.equal(t.unix(), BigInt(Date.UTC(2026, 3, 8, 10, 30, 0) / 1000));

  // Cross-midnight: 2026-04-09 01:00:00 UTC+2 = 2026-04-08 23:00:00 UTC
  const cross = date(2026, Month.April, 9, 1, 0, 0, 0, plus2);
  assert.equal(cross.unix(), BigInt(Date.UTC(2026, 3, 8, 23, 0, 0) / 1000));
});

test("calendar accessors reflect the time's location", () => {
  // 2026-04-08 23:30:15 UTC+2 = 2026-04-08 21:30:15 UTC
  const t = date(2026, Month.April, 8, 23, 30, 15, 0, plus2);
  assert.equal(t.hour(), 23);
  assert.equal(t.minute(), 30);
  assert.equal(t.second(), 15);
  assert.equal(t.day(), 8);
  assert.equal(t.month(), Month.April);
  assert.equal(t.year(), 2026);
  assert.deepEqual(t.clock(), [23, 30, 15]);
  assert.deepEqual(t.date(), [2026, Month.April, 8]);

  // Cross-midnight: 2026-04-09 01:30:00 UTC+2 = 2026-04-08 23:30:00 UTC
  const early = date(2026, Month.April, 9, 1, 30, 0, 0, plus2);
  assert.equal(early.year(), 2026);
  assert.equal(early.month(), Month.April);
  assert.equal(early.day(), 9);
  assert.equal(early.hour(), 1);
  assert.equal(early.minute(), 30);
});

test("format outputs the time in its location", () => {
  // 2026-04-08 12:00:00 UTC+2 = 2026-04-08 10:00:00 UTC
  const t = date(2026, Month.April, 8, 12, 0, 0, 0, plus2);
  assert.equal(t.format(DateOnly), "2026-04-08");
  assert.equal(t.format(TimeOnly), "12:00:00");
  assert.equal(t.format(DateTime), "2026-04-08 12:00:00");
  assert.equal(t.format(RFC3339), "2026-04-08T12:00:00+02:00");

  // Negative offset: 2026-04-08 07:00:00 UTC-5 = 2026-04-08 12:00:00 UTC
  const est = fixedZone("EST", -5 * 3600);
  const tEst = date(2026, Month.April, 8, 7, 0, 0, 0, est);
  assert.equal(tEst.format(DateOnly), "2026-04-08");
  assert.equal(tEst.format(TimeOnly), "07:00:00");
  assert.equal(tEst.format(RFC3339), "2026-04-08T07:00:00-05:00");
});
