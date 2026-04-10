import { Duration, Hour, Minute, Second, parseDuration } from "../src/index.js";

type DurationCase = {
  input: string;
  wantMs: bigint;
};

test("parseDuration parses supported units and signs", () => {
  const cases: DurationCase[] = [
    {
      input: "2h45m10.5s",
      wantMs: 2n * Hour + 45n * Minute + 10n * Second + 500n,
    },
    { input: "+1.5ms", wantMs: 1n },
    { input: " 1m30s ", wantMs: 90n * Second },
  ];

  for (const c of cases) {
    expect(parseDuration(c.input).milliseconds()).toBe(c.wantMs);
  }
});

test("parseDuration rejects malformed values", () => {
  const invalid = ["", " ", "+", "-", "1", "1x", "1.", "1..2s", "1abc", "1xs"];
  for (const input of invalid) {
    expect(() => parseDuration(input)).toThrow(/./);
  }
});

test("Duration conversions expose consistent units", () => {
  const d = new Duration(3n * Hour + 30n * Minute + 2n * Second + 250n);

  expect(d.milliseconds()).toBe(12_602_250n);
  expect(d.seconds()).toBe(12_602.25);
  expect(d.minutes()).toBe(210.0375);
  expect(d.hours()).toBe(3.500625);
});

test("Duration string formatting follows Go-like display behavior", () => {
  const cases = [
    { d: new Duration(0n), want: "0s" },
    { d: new Duration(999n), want: "999ms" },
    { d: new Duration(1_500n), want: "1.5s" },
    { d: new Duration(1n * Hour + 2n * Minute + 3n * Second), want: "1h2m3s" },
    { d: new Duration(3n * Second + 100n), want: "3.1s" },
    { d: new Duration(-1_500n), want: "-1.5s" },
    { d: new Duration(-1n * Second), want: "-1s" },
  ];

  for (const c of cases) {
    expect(c.d.toString()).toBe(c.want);
  }
});

test("Duration abs round and truncate obey step semantics", () => {
  const step = new Duration(1n * Second);
  const values = [
    {
      d: new Duration(3_499n),
      round: 3_000n,
      trunc: 3_000n,
    },
    {
      d: new Duration(3_500n),
      round: 4_000n,
      trunc: 3_000n,
    },
    {
      d: new Duration(-3_500n),
      round: -4_000n,
      trunc: -3_000n,
    },
  ];

  for (const c of values) {
    expect(c.d.round(step).milliseconds()).toBe(c.round);
    expect(c.d.truncate(step).milliseconds()).toBe(c.trunc);
  }

  const unchanged = new Duration(123n);
  expect(unchanged.round(new Duration(0n)).milliseconds()).toBe(123n);
  expect(unchanged.truncate(new Duration(-1n)).milliseconds()).toBe(123n);
  expect(new Duration(2n * Second).round(step).milliseconds()).toBe(2n * Second);
  expect(new Duration(-42n).abs().milliseconds()).toBe(42n);
});

test("parseDuration rejects missing numeric value before unit", () => {
  expect(() => parseDuration("ms")).toThrow(/./);
});
