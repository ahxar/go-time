import test from "node:test";
import assert from "node:assert/strict";

import {
  Duration,
  Hour,
  Microsecond,
  Millisecond,
  Minute,
  Nanosecond,
  Second,
  parseDuration
} from "../src/index.js";

type DurationCase = {
  input: string;
  wantNs: bigint;
};

test("parseDuration parses supported units and signs", () => {
  const cases: DurationCase[] = [
    { input: "2h45m10.5s", wantNs: 2n * Hour + 45n * Minute + 10n * Second + 500_000_000n },
    { input: "+1.5ms", wantNs: 1_500_000n },
    { input: "2us", wantNs: 2n * Microsecond },
    { input: "2µs", wantNs: 2n * Microsecond },
    { input: "-3ns", wantNs: -3n * Nanosecond },
    { input: "500ms250us7ns", wantNs: 500n * Millisecond + 250n * Microsecond + 7n },
    { input: " 1m30s ", wantNs: 90n * Second }
  ];

  for (const c of cases) {
    assert.equal(parseDuration(c.input).nanoseconds(), c.wantNs, c.input);
  }
});

test("parseDuration rejects malformed values", () => {
  const invalid = ["", " ", "+", "-", "1", "1x", "1.", "1..2s"];
  for (const input of invalid) {
    assert.throws(() => parseDuration(input), input);
  }
});

test("Duration conversions expose consistent units", () => {
  const d = new Duration(3n * Hour + 30n * Minute + 2n * Second + 250_000_000n);

  assert.equal(d.nanoseconds(), 12_602_250_000_000n);
  assert.equal(d.microseconds(), 12_602_250_000n);
  assert.equal(d.milliseconds(), 12_602_250n);
  assert.equal(d.seconds(), 12_602.25);
  assert.equal(d.minutes(), 210.0375);
  assert.equal(d.hours(), 3.500625);
});

test("Duration string formatting follows Go-like display behavior", () => {
  const cases = [
    { d: new Duration(0n), want: "0s" },
    { d: new Duration(999n), want: "999ns" },
    { d: new Duration(1_000n), want: "1us" },
    { d: new Duration(1_500n), want: "1.5us" },
    { d: new Duration(1_000_000n), want: "1ms" },
    { d: new Duration(1_500_000n), want: "1.5ms" },
    { d: new Duration(1n * Hour + 2n * Minute + 3n * Second), want: "1h2m3s" },
    { d: new Duration(3n * Second + 100_000_000n), want: "3.1s" },
    { d: new Duration(-1_500_000n), want: "-1.5ms" },
    { d: new Duration(-1n * Second), want: "-1s" }
  ];

  for (const c of cases) {
    assert.equal(c.d.toString(), c.want);
  }
});

test("Duration abs round and truncate obey step semantics", () => {
  const step = new Duration(1n * Second);
  const values = [
    {
      d: new Duration(3_499_999_999n),
      round: 3_000_000_000n,
      trunc: 3_000_000_000n
    },
    {
      d: new Duration(3_500_000_000n),
      round: 4_000_000_000n,
      trunc: 3_000_000_000n
    },
    {
      d: new Duration(-3_500_000_000n),
      round: -4_000_000_000n,
      trunc: -3_000_000_000n
    }
  ];

  for (const c of values) {
    assert.equal(c.d.round(step).nanoseconds(), c.round);
    assert.equal(c.d.truncate(step).nanoseconds(), c.trunc);
  }

  const unchanged = new Duration(123n);
  assert.equal(unchanged.round(new Duration(0n)).nanoseconds(), 123n);
  assert.equal(unchanged.truncate(new Duration(-1n)).nanoseconds(), 123n);
  assert.equal(new Duration(2n * Second).round(step).nanoseconds(), 2n * Second);
  assert.equal(new Duration(-42n).abs().nanoseconds(), 42n);
});

test("parseDuration rejects missing numeric value before unit", () => {
  assert.throws(() => parseDuration("ms"));
});
