import {
  UTC,
  Local,
  fixedZone,
  loadLocation,
  date,
  parseDuration,
  Month,
  RFC3339,
  DateTime,
} from "../src/index.js";

console.log("=== Location ===\n");

console.log("--- Built-in zones ---");
console.log("UTC:", UTC.toString());
console.log("Local:", Local.toString());

console.log("\n--- fixedZone ---");
const est = fixedZone("EST", -5 * 3600);
const ist = fixedZone("IST", 5 * 3600 + 30 * 60);
const cet = fixedZone("CET", 1 * 3600);

console.log("EST:", est.toString(), "offset:", est.fixedOffsetSeconds, "s");
console.log("IST:", ist.toString(), "offset:", ist.fixedOffsetSeconds, "s");
console.log("CET:", cet.toString(), "offset:", cet.fixedOffsetSeconds, "s");

console.log("\n--- loadLocation (IANA zones) ---");
const newYork = loadLocation("America/New_York");
const tokyo = loadLocation("Asia/Tokyo");
const london = loadLocation("Europe/London");
const paris = loadLocation("Europe/Paris");

console.log("New York:", newYork.toString());
console.log("Tokyo:", tokyo.toString());
console.log("London:", london.toString());
console.log("Paris:", paris.toString());

console.log("\n--- Same instant across zones ---");
const utcTime = date(2026, Month.April, 10, 12, 0, 0, 0, UTC);
console.log("UTC:", utcTime.format(RFC3339));
console.log("in New York:", utcTime.in(newYork).format(DateTime));
console.log("in Tokyo:", utcTime.in(tokyo).format(DateTime));
console.log("in London:", utcTime.in(london).format(DateTime));
console.log("in Paris:", utcTime.in(paris).format(DateTime));
console.log("in EST (fixed):", utcTime.in(est).format(DateTime));
console.log("in IST (fixed):", utcTime.in(ist).format(DateTime));

console.log("\n--- zone() info ---");
console.log("UTC zone:", utcTime.zone());
console.log("New York zone:", utcTime.in(newYork).zone());
console.log("Tokyo zone:", utcTime.in(tokyo).zone());
console.log("EST fixed zone:", utcTime.in(est).zone());

console.log("\n--- before/after proof across locations ---");
const sameUtc = utcTime;
const sameNyc = utcTime.in(newYork);
const sameTokyo = utcTime.in(tokyo);

console.log(
  "same instant represented in UTC/NYC should be equal (expected true):",
  sameUtc.equal(sameNyc),
);
console.log(
  "same instant represented in UTC/Tokyo should be equal (expected true):",
  sameUtc.equal(sameTokyo),
);
console.log(
  "same instant represented in NYC/Tokyo should be equal (expected true):",
  sameNyc.equal(sameTokyo),
);
console.log("same instant UTC before NYC? should be false:", sameUtc.before(sameNyc));
console.log("same instant UTC after NYC? should be false:", sameUtc.after(sameNyc));

const laterUtc = sameUtc.add(parseDuration("1m"));
const laterNyc = laterUtc.in(newYork);
console.log("later instant (+1m) UTC after original NYC should be true:", laterUtc.after(sameNyc));
console.log(
  "later instant (+1m) NYC after original Tokyo should be true:",
  laterNyc.after(sameTokyo),
);
console.log(
  "original Tokyo instant before later NYC instant should be true:",
  sameTokyo.before(laterNyc),
);

console.log("\n--- Creating time in a specific zone ---");
const noonInTokyo = date(2026, Month.April, 10, 12, 0, 0, 0, tokyo);
console.log("noon in Tokyo:", noonInTokyo.format(RFC3339));
console.log("same instant in UTC:", noonInTokyo.utc().format(RFC3339));

console.log("\n--- loadLocation edge cases ---");
console.log('loadLocation("UTC"):', loadLocation("UTC").toString());
console.log('loadLocation("Local"):', loadLocation("Local").toString());
