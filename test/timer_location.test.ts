import test from "node:test";
import assert from "node:assert/strict";

import {
  after,
  afterFunc,
  fixedZone,
  loadLocation,
  newTicker,
  newTimer,
  parseDuration,
  tick,
  unix
} from "../src/index.js";
import { TimeChannel } from "../src/timer.js";

test("location loading and fixed zones expose expected behavior", () => {
  const utc = loadLocation("");
  assert.equal(utc.toString(), "UTC");
  assert.equal(loadLocation("UTC").toString(), "UTC");
  assert.equal(loadLocation("Local").toString(), "Local");

  const named = loadLocation("Europe/Paris");
  assert.equal(named.toString(), "Europe/Paris");

  const fixed = fixedZone("X", 3600);
  assert.equal(fixed.toString(), "X");

  assert.throws(() => loadLocation("Not/A_Zone"));
});

test("TimeChannel delivers to waiters, buffers values, and respects capacity", async () => {
  const ch = new TimeChannel(1);

  const waiting = ch.recv();
  const sent = unix(1n, 0n);
  ch.push(sent);
  assert.equal((await waiting).unixMilli(), sent.unixMilli());

  for (const value of [unix(2n, 0n), unix(3n, 0n)]) {
    ch.push(value);
  }
  assert.equal((await ch.recv()).unix(), 2n);

  ch.push(unix(4n, 0n));
  const iter = ch[Symbol.asyncIterator]();
  const next = await iter.next();
  assert.equal(next.done, false);
  assert.equal(next.value.unix(), 4n);

  const broken = new TimeChannel(1) as unknown as {
    queue: Array<ReturnType<typeof unix> | undefined>;
    recv: () => Promise<ReturnType<typeof unix>>;
  };
  broken.queue = [undefined];
  assert.throws(() => broken.recv(), /unexpected empty channel queue/);
});

test("timer emits, can stop, and can reset", async () => {
  const activeTimer = newTimer(parseDuration("20ms"));
  assert.equal(activeTimer.stop(), true);
  assert.equal(activeTimer.stop(), false);

  const firedTimer = newTimer(parseDuration("1ms"));
  const first = await firedTimer.C.recv();
  assert.ok(first.unixMilli() > 0n);
  assert.equal(firedTimer.stop(), false);

  const resetTimer = newTimer(parseDuration("20ms"));
  assert.equal(resetTimer.reset(parseDuration("1ms")), true);
  const afterReset = await resetTimer.C.recv();
  assert.ok(afterReset.unixMilli() > 0n);
  assert.equal(resetTimer.reset(parseDuration("1ms")), false);
  await resetTimer.C.recv();
});

test("after and afterFunc schedule one-shot events", async () => {
  const when = await after(parseDuration("1ms"));
  assert.ok(when.unixMilli() > 0n);

  await new Promise<void>((resolve) => {
    const timer = afterFunc(parseDuration("1ms"), () => resolve());
    assert.equal(timer.stop(), true);
    timer.reset(parseDuration("1ms"));
  });
});

test("ticker ticks, resets, and validates intervals", async () => {
  assert.throws(() => newTicker(parseDuration("0s")));

  const ticker = newTicker(parseDuration("1ms"));
  const first = await ticker.C.recv();
  const second = await ticker.C.recv();
  assert.ok(second.unixMilli() >= first.unixMilli());

  const iter = ticker[Symbol.asyncIterator]();
  const iterTick = await iter.next();
  assert.equal(iterTick.done, false);

  ticker.reset(parseDuration("1ms"));
  const afterReset = await ticker.C.recv();
  assert.ok(afterReset.unixMilli() > 0n);
  ticker.stop();
  ticker.stop();
  assert.throws(() => ticker.reset(parseDuration("0s")));
});

test("tick returns null for non-positive durations and creates channel for positive durations", () => {
  assert.equal(tick(parseDuration("0s")), null);

  const before = new Set(
    (process as unknown as { _getActiveHandles: () => object[] })._getActiveHandles?.() ?? []
  );
  const ch = tick(parseDuration("1ms"));
  assert.notEqual(ch, null);

  const after =
    (
      process as unknown as { _getActiveHandles: () => Array<NodeJS.Timeout | object> }
    )._getActiveHandles?.() ?? [];
  for (const handle of after) {
    if (before.has(handle)) {
      continue;
    }
    if (typeof handle === "object" && handle !== null && "hasRef" in handle) {
      clearInterval(handle);
    }
  }
});
