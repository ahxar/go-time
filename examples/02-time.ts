import {
  ANSIC,
  DateOnly,
  DateTime,
  Hour,
  Kitchen,
  Month,
  Minute,
  RFC3339,
  RFC822,
  RFC1123,
  Second,
  Stamp,
  StampMilli,
  TimeOnly,
  Weekday,
  date,
  now,
  parse,
  parseInLocation,
  since,
  unix,
  unixMilli,
  until,
  UTC,
  loadLocation,
} from "../src/index.js";

console.log("=== Time ===\n");

console.log("--- Construction ---");
const t1 = now();
console.log("now():", t1.toString());

const t2 = date(2026, Month.April, 10, 12, 0, 0, 0, UTC);
console.log("date(2026, April, 10, 12, 0, 0, 0, UTC):", t2.toString());

const t3 = date({
  year: 2026,
  month: Month.January,
  day: 1,
  hour: 0,
  minute: 0,
  second: 0,
  millisecond: 0,
});
console.log("date({ year: 2026, ... }):", t3.toString());

const t4 = unix(1_744_286_400n);
console.log("unix(1_744_286_400n):", t4.toString());

const t5 = unixMilli(1_744_286_400_000n);
console.log("unixMilli(1_744_286_400_000n):", t5.toString());

console.log("\n--- Formatting ---");
console.log("RFC3339:", t2.format(RFC3339));
console.log("DateTime:", t2.format(DateTime));
console.log("DateOnly:", t2.format(DateOnly));
console.log("TimeOnly:", t2.format(TimeOnly));
console.log("Kitchen:", t2.format(Kitchen));
console.log("RFC822:", t2.format(RFC822));
console.log("RFC1123:", t2.format(RFC1123));
console.log("ANSIC:", t2.format(ANSIC));
console.log("Stamp:", t2.format(Stamp));
console.log("StampMilli:", t2.format(StampMilli));

console.log("\n--- Parsing ---");
const p1 = parse(RFC3339, "2026-04-10T12:00:00Z");
console.log('parse(RFC3339, "2026-04-10T12:00:00Z"):', p1.toString());

const p2 = parse(DateOnly, "2026-04-10");
console.log('parse(DateOnly, "2026-04-10"):', p2.format(DateOnly));

const nyc = loadLocation("America/New_York");
const p3 = parseInLocation(DateOnly, "2026-04-10", nyc);
console.log('parseInLocation(DateOnly, "2026-04-10", NYC):', p3.toString());

console.log("\n--- Date fields ---");
console.log("year:", t2.year());
console.log("month:", t2.month(), "(", Month[t2.month()], ")");
console.log("day:", t2.day());
console.log("hour:", t2.hour());
console.log("minute:", t2.minute());
console.log("second:", t2.second());
console.log("millisecond:", t2.millisecond());
console.log("weekday:", t2.weekday(), "(", Weekday[t2.weekday()], ")");
console.log("yearDay:", t2.yearDay());
console.log("isoWeek:", t2.isoWeek());
console.log("clock():", t2.clock());
console.log("date():", t2.date());

console.log("\n--- Arithmetic ---");
const oneDay = 24n * Hour;
const tomorrow = t2.add(oneDay);
console.log("t2 + 24h:", tomorrow.format(DateOnly));

const lastYear = t2.addDate(-1, 0, 0);
console.log("t2 - 1 year:", lastYear.format(DateOnly));

const nextMonth = t2.addDate(0, 1, 0);
console.log("t2 + 1 month:", nextMonth.format(DateOnly));

const elapsed = t2.sub(t3);
console.log("t2.sub(t3):", elapsed.toString());

console.log("\n--- Comparison ---");
console.log("t2.before(tomorrow):", t2.before(tomorrow));
console.log("t2.after(yesterday):", t2.after(t3));
console.log("t2.equal(t2):", t2.equal(t2));
console.log("t2.compare(tomorrow):", t2.compare(tomorrow));

console.log("\n--- Rounding & Truncation ---");
const at30s = date(2026, Month.April, 10, 12, 34, 30, 0, UTC);
console.log("at 30 seconds:", at30s.format(DateTime));
console.log("truncate to 1m:", at30s.truncate(Minute).format(DateTime));
console.log("round to 1m:", at30s.round(Minute).format(DateTime));
const withMs = date(2026, Month.April, 10, 12, 34, 56, 789, UTC);
console.log("with milliseconds:", withMs.toString());
console.log("truncate to 1s:", withMs.truncate(Second).toString());
console.log("round to 1s:", withMs.round(Second).toString());

console.log("\n--- Timezone ---");
console.log("utc():", t2.utc().toString());
console.log("local():", t2.local().toString());
console.log("zone():", t2.zone());
console.log("in(NYC):", t2.in(nyc).toString());

console.log("\n--- Unix timestamps ---");
console.log("unix():", t2.unix());
console.log("unixMilli():", t2.unixMilli());

console.log("\n--- since / until ---");
const futureWall = date(2099, Month.January, 1, 0, 0, 0, 0, UTC);
console.log("since(now):", since(t1).toString());
console.log("until(2099-01-01):", until(futureWall).toString());

console.log("\n--- isZero ---");
const zero = unix(0n);
console.log("unix(0n).isZero():", zero.isZero());
console.log("now().isZero():", t1.isZero());
