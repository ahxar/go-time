import {
  after,
  afterFunc,
  fixedZone,
  loadLocation,
  newTicker,
  newTimer,
  parseDuration,
  tick,
  unix,
} from "../src/index.js";
import { TimeChannel } from "../src/timer.js";

test("location loading and fixed zones expose expected behavior", () => {
  const utc = loadLocation("");
  expect(utc.toString()).toBe("UTC");
  expect(loadLocation("UTC").toString()).toBe("UTC");
  expect(loadLocation("Local").toString()).toBe("Local");

  const named = loadLocation("Europe/Paris");
  expect(named.toString()).toBe("Europe/Paris");

  const fixed = fixedZone("X", 3600);
  expect(fixed.toString()).toBe("X");

  expect(() => loadLocation("Not/A_Zone")).toThrow(/./);
});

test("TimeChannel delivers to waiters, buffers values, and respects capacity", async () => {
  const ch = new TimeChannel(1);

  const waiting = ch.recv();
  const sent = unix(1n, 0n);
  ch.push(sent);
  expect((await waiting).unixMilli()).toBe(sent.unixMilli());

  for (const value of [unix(2n, 0n), unix(3n, 0n)]) {
    ch.push(value);
  }
  expect((await ch.recv()).unix()).toBe(2n);

  ch.push(unix(4n, 0n));
  const iter = ch[Symbol.asyncIterator]();
  const next = await iter.next();
  expect(next.done).toBe(false);
  if (next.done) {
    throw new Error("expected iterator value");
  }
  expect(next.value.unix()).toBe(4n);

  const broken = new TimeChannel(1) as unknown as {
    queue: Array<ReturnType<typeof unix> | undefined>;
    recv: () => Promise<ReturnType<typeof unix>>;
  };
  broken.queue = [undefined];
  expect(() => broken.recv()).toThrow(/unexpected empty channel queue/);
});

test("timer emits, can stop, and can reset", async () => {
  const activeTimer = newTimer(parseDuration("20ms"));
  expect(activeTimer.stop()).toBe(true);
  expect(activeTimer.stop()).toBe(false);

  const firedTimer = newTimer(parseDuration("1ms"));
  const first = await firedTimer.C.recv();
  expect(first.unixMilli()).toBeGreaterThan(0n);
  expect(firedTimer.stop()).toBe(false);

  const resetTimer = newTimer(parseDuration("20ms"));
  expect(resetTimer.reset(parseDuration("1ms"))).toBe(true);
  const afterReset = await resetTimer.C.recv();
  expect(afterReset.unixMilli()).toBeGreaterThan(0n);
  expect(resetTimer.reset(parseDuration("1ms"))).toBe(false);
  await resetTimer.C.recv();

  expect(resetTimer.reset(1n)).toBe(false);
  await resetTimer.C.recv();
});

test("after and afterFunc schedule one-shot events", async () => {
  const when = await after(parseDuration("1ms"));
  expect(when.unixMilli()).toBeGreaterThan(0n);

  await new Promise<void>((resolve) => {
    const timer = afterFunc(parseDuration("1ms"), () => resolve());
    expect(timer.stop()).toBe(true);
    timer.reset(parseDuration("1ms"));
  });
});

test("ticker ticks, resets, and validates intervals", async () => {
  expect(() => newTicker(parseDuration("0s"))).toThrow(/./);

  const ticker = newTicker(parseDuration("1ms"));
  const first = await ticker.C.recv();
  const second = await ticker.C.recv();
  expect(second.unixMilli()).toBeGreaterThanOrEqual(first.unixMilli());

  const iter = ticker[Symbol.asyncIterator]();
  const iterTick = await iter.next();
  expect(iterTick.done).toBe(false);

  ticker.reset(parseDuration("1ms"));
  const afterReset = await ticker.C.recv();
  expect(afterReset.unixMilli()).toBeGreaterThan(0n);
  ticker.reset(1n);
  const afterBigintReset = await ticker.C.recv();
  expect(afterBigintReset.unixMilli()).toBeGreaterThan(0n);
  ticker.stop();
  ticker.stop();
  expect(() => ticker.reset(parseDuration("0s"))).toThrow(/./);
  expect(() => ticker.reset(0n)).toThrow(/./);
});

test("tick returns null for non-positive durations and creates channel for positive durations", () => {
  expect(tick(parseDuration("0s"))).toBeNull();
  expect(tick(0n)).toBeNull();

  const before = new Set(
    (process as unknown as { _getActiveHandles: () => object[] })._getActiveHandles?.() ?? [],
  );
  const ch = tick(parseDuration("1ms"));
  expect(ch).not.toBeNull();

  const activeHandles =
    (
      process as unknown as {
        _getActiveHandles: () => Array<NodeJS.Timeout | object>;
      }
    )._getActiveHandles?.() ?? [];
  for (const handle of activeHandles) {
    if (before.has(handle)) {
      continue;
    }
    if (typeof handle === "object" && handle !== null && "hasRef" in handle) {
      clearInterval(handle);
    }
  }
});

test("timer helpers accept bigint duration inputs", async () => {
  const when = await after(1n);
  expect(when.unixMilli()).toBeGreaterThan(0n);

  await new Promise<void>((resolve) => {
    const timer = afterFunc(1n, () => resolve());
    expect(timer.stop()).toBe(true);
    timer.reset(1n);
  });

  const timer = newTimer(1n);
  const fired = await timer.C.recv();
  expect(fired.unixMilli()).toBeGreaterThan(0n);

  const ticker = newTicker(1n);
  const ticked = await ticker.C.recv();
  expect(ticked.unixMilli()).toBeGreaterThan(0n);
  ticker.stop();

  expect(() => newTicker(0n)).toThrow(/./);
});
