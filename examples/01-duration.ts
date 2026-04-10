import {
  Duration,
  Hour,
  Millisecond,
  Minute,
  Second,
  parseDuration,
} from "../src/index.js";

console.log("=== Duration ===\n");

const oneHour = new Duration(Hour);
const thirtyMin = new Duration(30n * Minute);
const twoSec = new Duration(2n * Second);
const fiveHundredMs = new Duration(500n * Millisecond);

console.log("oneHour:", oneHour.toString());
console.log("thirtyMin:", thirtyMin.toString());
console.log("twoSec:", twoSec.toString());
console.log("fiveHundredMs:", fiveHundredMs.toString());

console.log("\n--- Conversion ---");
console.log("oneHour.hours():", oneHour.hours());
console.log("thirtyMin.minutes():", thirtyMin.minutes());
console.log("twoSec.seconds():", twoSec.seconds());
console.log("fiveHundredMs.milliseconds():", fiveHundredMs.milliseconds());

console.log("\n--- Parsing ---");
const parsed = parseDuration("1h30m45.5s");
console.log('parseDuration("1h30m45.5s"):', parsed.toString());
console.log("  .hours():", parsed.hours());
console.log("  .minutes():", parsed.minutes());

const neg = parseDuration("-2h45m");
console.log('parseDuration("-2h45m"):', neg.toString());
console.log("  .abs():", neg.abs().toString());

console.log("\n--- Arithmetic ---");
const sum = new Duration(oneHour.milliseconds() + thirtyMin.milliseconds());
console.log("1h + 30m =", sum.toString());

const roundUnit = new Duration(Minute);
console.log("1h30m45.5s rounded to 1m:", parsed.round(roundUnit).toString());
console.log(
  "1h30m45.5s truncated to 1m:",
  parsed.truncate(roundUnit).toString(),
);
