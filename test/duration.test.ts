import test from "node:test";
import assert from "node:assert/strict";

import { Duration, Hour, Minute, Second, parseDuration } from "../src/index.js";

type DurationCase = {
  input: string;
  wantMs: bigint;
};

test("parseDuration parses supported units and signs", () => {
  const cases: DurationCase[] = [
    { input: "2h45m10.5s", wantMs: 2n * Hour + 45n * Minute + 10n * Second + 500n },
    { input: "+1.5ms", wantMs: 1n },
    { input: " 1m30s ", wantMs: 90n * Second }
  ];

  for (const c of cases) {
    assert.equal(parseDuration(c.input).milliseconds(), c.wantMs, c.input);
  }
});

test("parseDuration rejects malformed values", () => {
  const invalid = ["", " ", "+", "-", "1", "1x", "1.", "1..2s", "1abc", "1xs"];
  for (const input of invalid) {
    assert.throws(() => parseDuration(input), input);
  }
});

test("Duration conversions expose consistent units", () => {
  const d = new Duration(3n * Hour + 30n * Minute + 2n * Second + 250n);

  assert.equal(d.milliseconds(), 12_602_250n);
  assert.equal(d.seconds(), 12_602.25);
  assert.equal(d.minutes(), 210.0375);
  assert.equal(d.hours(), 3.500625);
});

test("Duration string formatting follows Go-like display behavior", () => {
  const cases = [
    { d: new Duration(0n), want: "0s" },
    { d: new Duration(999n), want: "999ms" },
    { d: new Duration(1_500n), want: "1.5s" },
    { d: new Duration(1n * Hour + 2n * Minute + 3n * Second), want: "1h2m3s" },
    { d: new Duration(3n * Second + 100n), want: "3.1s" },
    { d: new Duration(-1_500n), want: "-1.5s" },
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
      d: new Duration(3_499n),
      round: 3_000n,
      trunc: 3_000n
    },
    {
      d: new Duration(3_500n),
      round: 4_000n,
      trunc: 3_000n
    },
    {
      d: new Duration(-3_500n),
      round: -4_000n,
      trunc: -3_000n
    }
  ];

  for (const c of values) {
    assert.equal(c.d.round(step).milliseconds(), c.round);
    assert.equal(c.d.truncate(step).milliseconds(), c.trunc);
  }

  const unchanged = new Duration(123n);
  assert.equal(unchanged.round(new Duration(0n)).milliseconds(), 123n);
  assert.equal(unchanged.truncate(new Duration(-1n)).milliseconds(), 123n);
  assert.equal(new Duration(2n * Second).round(step).milliseconds(), 2n * Second);
  assert.equal(new Duration(-42n).abs().milliseconds(), 42n);
});

test("parseDuration rejects missing numeric value before unit", () => {
  assert.throws(() => parseDuration("ms"));
});
