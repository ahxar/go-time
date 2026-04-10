import {
  Duration,
  Hour,
  Millisecond,
  Minute,
  Second,
  parseDuration,
  now,
  date,
  parse,
  parseInLocation,
  since,
  until,
  unix,
  unixMilli,
  sleep,
  after,
  afterFunc,
  newTimer,
  newTicker,
  UTC,
  Local,
  fixedZone,
  loadLocation,
  Month,
  Weekday,
  RFC3339,
  RFC822,
  RFC1123,
  DateOnly,
  DateTime,
  TimeOnly,
  Kitchen,
  Stamp,
  StampMilli,
} from "../src/index.js";

const sep = (title: string) => console.log(`\n${"─".repeat(50)}\n  ${title}\n${"─".repeat(50)}`);

sep("1. Duration");

const d1 = new Duration(1n * Hour + 30n * Minute + 5n * Second + 250n * Millisecond);
console.log("1h30m5.25s:", d1.toString());
console.log("  .hours():", d1.hours());
console.log("  .minutes():", d1.minutes());
console.log("  .seconds():", d1.seconds());
console.log("  .milliseconds():", d1.milliseconds());

const d2 = parseDuration("2h45m");
const d3 = parseDuration("-90m");
console.log('parseDuration("2h45m"):', d2.toString());
console.log('parseDuration("-90m"):', d3.toString(), "abs:", d3.abs().toString());
console.log("round to 1h:", d2.round(new Duration(Hour)).toString());
console.log("truncate to 1h:", d2.truncate(new Duration(Hour)).toString());

sep("2. Time — construction");

const t = now();
console.log("now():", t.toString());

const fixed = date(2026, Month.April, 10, 14, 30, 0, 0, UTC);
console.log("date(2026, Apr, 10, 14:30, UTC):", fixed.toString());

const fromUnix = unix(1_744_286_400n);
console.log("unix(1_744_286_400):", fromUnix.toString());

const fromMilli = unixMilli(1_744_286_400_000n);
console.log("unixMilli(1_744_286_400_000):", fromMilli.toString());

sep("3. Time — formatting");

console.log("RFC3339:", fixed.format(RFC3339));
console.log("RFC822:", fixed.format(RFC822));
console.log("RFC1123:", fixed.format(RFC1123));
console.log("DateTime:", fixed.format(DateTime));
console.log("DateOnly:", fixed.format(DateOnly));
console.log("TimeOnly:", fixed.format(TimeOnly));
console.log("Kitchen:", fixed.format(Kitchen));
console.log("Stamp:", fixed.format(Stamp));
console.log("StampMilli:", fixed.format(StampMilli));

sep("4. Time — parsing");

const p1 = parse(RFC3339, "2026-04-10T14:30:00Z");
console.log('parse(RFC3339, "2026-04-10T14:30:00Z"):', p1.toString());

const p2 = parse(DateOnly, "2026-04-10");
console.log('parse(DateOnly, "2026-04-10"):', p2.format(DateOnly));

const nyc = loadLocation("America/New_York");
const p3 = parseInLocation(DateOnly, "2026-04-10", nyc);
console.log('parseInLocation(DateOnly, "2026-04-10", NYC):', p3.toString());

sep("5. Time — fields & arithmetic");

console.log("year:", fixed.year(), "month:", Month[fixed.month()], "day:", fixed.day());
console.log("hour:", fixed.hour(), "minute:", fixed.minute(), "second:", fixed.second());
console.log("weekday:", Weekday[fixed.weekday()], "yearDay:", fixed.yearDay());
console.log("isoWeek:", fixed.isoWeek());
console.log("clock():", fixed.clock());
console.log("date():", fixed.date());

const tomorrow = fixed.add(24n * Hour);
console.log("fixed + 24h =", tomorrow.format(DateOnly));
console.log("fixed.addDate(0, 1, 0):", fixed.addDate(0, 1, 0).format(DateOnly));

const earlier = date(2026, Month.April, 10, 14, 0, 0, 0, UTC);
console.log("fixed.sub(earlier):", fixed.sub(earlier).toString());
console.log("fixed.before(tomorrow):", fixed.before(tomorrow));
console.log("fixed.after(earlier):", fixed.after(earlier));
console.log("fixed.compare(tomorrow):", fixed.compare(tomorrow));

const withMs = date(2026, Month.April, 10, 14, 30, 45, 678, UTC);
console.log("truncate to 1s:", withMs.truncate(1n * Second).toString());
console.log("round to 1m:", withMs.round(1n * Minute).toString());

console.log("since(earlier):", since(earlier).toString());
console.log("until(tomorrow):", until(tomorrow).toString());
console.log("unix():", fixed.unix(), "unixMilli():", fixed.unixMilli());
console.log("isZero:", unix(0n).isZero());

sep("6. Location & Timezone");

console.log("UTC:", UTC.toString());
console.log("Local:", Local.toString());

const est = fixedZone("EST", -5 * 3600);
const jst = loadLocation("Asia/Tokyo");
console.log('fixedZone("EST", -5h):', est.toString(), "offset:", est.fixedOffsetSeconds, "s");
console.log('loadLocation("Asia/Tokyo"):', jst.toString());

const utcNoon = date(2026, Month.April, 10, 12, 0, 0, 0, UTC);
console.log("noon UTC →", utcNoon.format(RFC3339));
console.log("in EST (fixed):", utcNoon.in(est).format(DateTime));
console.log("in Tokyo:", utcNoon.in(jst).format(DateTime));
console.log("UTC zone():", utcNoon.zone());
console.log("NYC zone():", utcNoon.in(nyc).zone());

sep("7. Timer & Ticker");

console.log("sleep(50ms)...");
await sleep(50n * Millisecond);
console.log("slept!");

const fireTime = await after(50n * Millisecond);
console.log("after(50ms) fired at:", fireTime.toString());

await new Promise<void>((resolve) => {
  afterFunc(50n * Millisecond, () => {
    console.log("afterFunc(50ms) callback fired");
    resolve();
  });
});

const timer = newTimer(100n * Millisecond);
const timerFire = await timer.C.recv();
console.log("newTimer(100ms) fired at:", timerFire.toString());

const stoppable = newTimer(500n * Millisecond);
console.log("stop before fire:", stoppable.stop());

const ticker = newTicker(50n * Millisecond);
let count = 0;
for await (const tick of ticker) {
  count++;
  console.log(`tick #${count}:`, tick.toString());
  if (count >= 3) {
    ticker.stop();
    break;
  }
}

console.log("\nAll examples complete.");
