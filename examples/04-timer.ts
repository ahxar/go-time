import {
  after,
  afterFunc,
  newTicker,
  newTimer,
  parseDuration,
  sleep,
} from "../src/index.js";

console.log("=== Timer & Ticker ===\n");

console.log("--- sleep ---");
const before = Date.now();
await sleep(parseDuration("50ms"));
const elapsed = Date.now() - before;
console.log(`sleep(50ms) woke after ~${elapsed}ms`);

console.log("\n--- after ---");
const t = await after(parseDuration("50ms"));
console.log("after(50ms) fired at:", t.toString());

console.log("\n--- afterFunc ---");
await new Promise<void>((resolve) => {
  afterFunc(parseDuration("50ms"), () => {
    console.log("afterFunc(50ms) callback fired");
    resolve();
  });
});

console.log("\n--- Timer (manual) ---");
const timer = newTimer(parseDuration("100ms"));
console.log("timer created, waiting...");
const fireTime = await timer.C.recv();
console.log("timer fired at:", fireTime.toString());

console.log("\n--- Timer stop ---");
const timer2 = newTimer(parseDuration("500ms"));
const stopped = timer2.stop();
console.log("stopped before firing:", stopped);

console.log("\n--- Timer reset ---");
const timer3 = newTimer(parseDuration("500ms"));
const wasActive = timer3.reset(parseDuration("50ms"));
console.log("was active before reset:", wasActive);
const resetFire = await timer3.C.recv();
console.log("timer fired after reset at:", resetFire.toString());

console.log("\n--- Ticker (3 ticks then stop) ---");
const ticker = newTicker(parseDuration("50ms"));
let ticks = 0;
for await (const tick of ticker) {
  ticks++;
  console.log(`tick #${ticks}:`, tick.toString());
  if (ticks >= 3) {
    ticker.stop();
    break;
  }
}

console.log("\n--- Ticker reset ---");
const ticker2 = newTicker(parseDuration("200ms"));
const t0 = await ticker2.C.recv();
console.log("first tick:", t0.toString());
ticker2.reset(parseDuration("50ms"));
const t1 = await ticker2.C.recv();
console.log("tick after reset (faster interval):", t1.toString());
ticker2.stop();

console.log("\nDone.");
