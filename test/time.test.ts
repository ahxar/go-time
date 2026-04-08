import test from "node:test";
import assert from "node:assert/strict";

import {
  ANSIC,
  DateOnly,
  DateTime,
  Kitchen,
  Month,
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
  unixMicro,
  unixMilli,
  unix,
  until
} from "../src/index.js";

const plus2 = fixedZone("PLUS2", 2 * 3600);

test("unix constructors expose epoch units", () => {
  const tMs = unixMilli(1_700_000_000_123n);
  assert.equal(tMs.unixMilli(), 1_700_000_000_123n);

  const tUs = unixMicro(1_700_000_000_123_456n);
  assert.equal(tUs.unixMicro(), 1_700_000_000_123_456n);

  const t = unix(10n, 750_000_000n);
  assert.equal(t.unix(), 10n);
  assert.equal(t.unixNano(), 10_750_000_000n);
  assert.equal(t.nanosecond(), 750_000_000);
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
  assert.equal(a.add(delta).sub(a).nanoseconds(), delta.nanoseconds());
});

test("monotonic subtraction uses monotonic clock when available", () => {
  const a = now();
  const b = now();
  assert.ok(a.sub(b).nanoseconds() <= 50_000_000n);
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
  const t = date(2026, Month.April, 8, 12, 30, 15, 123_456_789).utc();
  assert.deepEqual(t.date(), [2026, Month.April, 8]);
  assert.deepEqual(t.clock(), [12, 30, 15]);
  assert.equal(t.year(), 2026);
  assert.equal(t.month(), Month.April);
  assert.equal(t.day(), 8);
  assert.equal(t.hour(), 12);
  assert.equal(t.minute(), 30);
  assert.equal(t.second(), 15);
  assert.equal(t.weekday(), 3);
  assert.equal(t.yearDay(), 98);
  assert.deepEqual(date(2021, Month.January, 1, 0, 0, 0, 0).isoWeek(), [2020, 53]);
});

test("round and truncate follow step semantics", () => {
  const t = unix(10n, 750_000_000n);
  const step = parseDuration("1s");
  assert.equal(t.truncate(step).unixNano(), 10_000_000_000n);
  assert.equal(t.round(step).unixNano(), 11_000_000_000n);
  assert.equal(unix(10n, 0n).round(step).unixNano(), 10_000_000_000n);
  assert.equal(unix(10n, 200_000_000n).round(step).unixNano(), 10_000_000_000n);
  assert.equal(unix(-10n, -750_000_000n).round(step).unixNano(), -11_000_000_000n);
  assert.equal(t.round(parseDuration("0s")).unixNano(), t.unixNano());
  assert.equal(t.truncate(parseDuration("-1s")).unixNano(), t.unixNano());
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

test("RFC3339Nano formatting handles negative epoch fractions", () => {
  const negative = unix(-1n, -500_000_000n).utc();
  assert.equal(negative.format(RFC3339Nano), "1969-12-31T23:59:59.5Z");

  const wholeSecond = unix(1n, 0n).utc();
  assert.equal(wholeSecond.format(RFC3339Nano), "1970-01-01T00:00:01Z");
});

test("addDate normalizes month rollover", () => {
  const next = date(2021, Month.January, 31, 12, 0, 0, 0).addDate(0, 1, 0);
  assert.equal(next.year(), 2021);
  assert.equal(next.month(), Month.March);
  assert.equal(next.day(), 3);
});

test("format and parse roundtrip for supported layouts", () => {
  const utc = date(2026, Month.April, 8, 12, 34, 56, 123_456_789).utc();
  const zoned = date(2026, Month.April, 8, 12, 34, 56, 123_456_789, plus2);

  const cases: Array<{
    layout: string;
    sample: string;
    t: ReturnType<typeof unix>;
    stableRoundtrip: boolean;
  }> = [
    { layout: RFC3339, sample: "2026-04-08T12:34:56.123Z", t: utc, stableRoundtrip: true },
    {
      layout: RFC3339Nano,
      sample: "2026-04-08T12:34:56.123456789Z",
      t: utc,
      stableRoundtrip: true
    },
    { layout: DateOnly, sample: "2026-04-08", t: utc, stableRoundtrip: true },
    { layout: TimeOnly, sample: "12:34:56", t: utc, stableRoundtrip: true },
    { layout: DateTime, sample: "2026-04-08 12:34:56", t: utc, stableRoundtrip: true },
    { layout: Kitchen, sample: "12:34PM", t: utc, stableRoundtrip: true },
    { layout: Stamp, sample: "Apr  8 12:34:56", t: utc, stableRoundtrip: true },
    { layout: StampMilli, sample: "Apr  8 12:34:56.123", t: utc, stableRoundtrip: true },
    { layout: StampMicro, sample: "Apr  8 12:34:56.123456", t: utc, stableRoundtrip: true },
    { layout: StampNano, sample: "Apr  8 12:34:56.123456789", t: utc, stableRoundtrip: true },
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

  const offsetRfc3339Nano = parse(RFC3339Nano, "2026-04-08T12:34:56.123456789+02:30");
  assert.equal(offsetRfc3339Nano.unix(), 1775642696n);
  assert.equal(offsetRfc3339Nano.toString(), "2026-04-08T10:04:56.123456789Z");

  assert.equal(zoned.format(RFC822), "08 Apr 26 12:34 +0200");
  assert.equal(zoned.format(RFC850), "Wednesday, 08-Apr-26 12:34:56 +0200");
  assert.equal(zoned.format(RFC1123), "Wed, 08 Apr 2026 12:34:56 +0200");
});

test("parseInLocation uses provided location for wall-clock parsing", () => {
  const dt = parseInLocation(DateTime, "2026-04-08 12:00:00", plus2);
  assert.equal(dt.unix(), 1775642400n);
  assert.deepEqual(dt.zone(), ["PLUS2", 7200]);

  const d = parseInLocation(DateOnly, "2026-04-08", plus2);
  assert.equal(d.format(DateTime), "2026-04-07 22:00:00");

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
    { layout: RFC3339Nano, value: "bad" },
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
    { layout: StampMilli, value: "bad" },
    { layout: StampMicro, value: "bad" },
    { layout: StampNano, value: "bad" }
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

  assert.ok(elapsed.nanoseconds() >= 0n);
  assert.ok(remaining.nanoseconds() >= -5_000_000n);
  await sleep(parseDuration("0s"));
});
