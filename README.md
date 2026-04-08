# go-time

Go-inspired time utilities for Node.js with TypeScript types and zero runtime dependencies.

`go-time` brings familiar Go `time` concepts to JavaScript and TypeScript: durations, layouts, parsing/formatting, locations, timers, and tickers.

## Features

- Go-style duration values and parser (`2h45m10.5s`)
- `Time` API for arithmetic, comparisons, rounding, truncation, and calendar fields
- Monotonic clock support for stable elapsed-time measurement with `now()`, `sub()`, `since()`, and `until()`
- Layout-based parse/format helpers (`RFC3339`, `DateTime`, `Kitchen`, and more)
- Time zone support with UTC, local, fixed offsets, and IANA zone names
- Timer and ticker primitives inspired by Go channels
- ESM-first package with generated TypeScript declarations
- No runtime dependencies

## Installation

```bash
npm install go-time
```

## Requirements

- Node.js 20+

## Quick Start

```ts
import {
  DateTime,
  Month,
  RFC3339Nano,
  date,
  now,
  parse,
  parseDuration,
  since,
  sleep,
  unixMilli
} from "go-time";

const started = now();

const timeout = parseDuration("250ms");
await sleep(timeout);

const elapsed = since(started);
console.log(elapsed.toString()); // e.g. "252.3ms"

const t1 = parse(RFC3339Nano, "2026-04-08T09:10:11.123456789Z");
console.log(t1.nanosecond()); // 123456789

const t2 = date(2026, Month.April, 8, 12, 30, 0, 0);
console.log(t2.format(DateTime)); // "2026-04-08 12:30:00"

const t3 = unixMilli(1_700_000_000_123n);
console.log(t3.unixMilli()); // 1700000000123n
```

## Core Concepts

### Duration

```ts
import { Duration, Hour, Minute, Second, parseDuration } from "go-time";

const a = parseDuration("2h45m10.5s");
const b = new Duration(90n * Second);
const c = new Duration(1n * Hour + 30n * Minute);

console.log(a.nanoseconds()); // 9910500000000n
console.log(b.round(new Duration(1n * Second)).toString()); // "1m30s"
console.log(c.truncate(new Duration(1n * Minute)).toString()); // "1h30m0s"
```

Supported units: `ns`, `us`/`µs`, `ms`, `s`, `m`, `h`.

### Time and Layouts

```ts
import {
  DateOnly,
  DateTime,
  Kitchen,
  RFC3339,
  RFC3339Nano,
  parse,
  parseInLocation,
  fixedZone
} from "go-time";

const t = parse(RFC3339Nano, "2026-04-08T09:10:11.123456789Z");

console.log(t.format(DateOnly)); // "2026-04-08"
console.log(t.format(DateTime)); // "2026-04-08 09:10:11"
console.log(t.format(Kitchen)); // "9:10AM"
console.log(t.format(RFC3339)); // "2026-04-08T09:10:11.123Z"

const plus2 = fixedZone("PLUS2", 2 * 3600);
const localClock = parseInLocation(DateTime, "2026-04-08 12:00:00", plus2);
console.log(localClock.zone()); // ["PLUS2", 7200]
```

### Monotonic Time

`now()` records both wall-clock time and a monotonic reading. When two `Time` values both carry monotonic data, `sub()`, `since()`, and `until()` use the monotonic clock for elapsed-time calculations instead of wall-clock time.

This makes elapsed-time measurement stable across wall-clock adjustments. Times created with `unix()`, `unixMilli()`, `unixMicro()`, `date()`, or `parse()` do not include monotonic data.

```ts
import { now, parseDuration, since, sleep, unix } from "go-time";

const started = now();
await sleep(parseDuration("25ms"));

const elapsed = since(started);
console.log(elapsed.milliseconds()); // about 25

const a = now();
const b = a.add(parseDuration("1s"));
console.log(b.sub(a).seconds()); // 1

const wallOnly = unix(1_700_000_000n);
console.log(typeof wallOnly.unix()); // "bigint"
// `wallOnly` has no monotonic reading, so subtraction falls back to wall-clock time.
```

### Locations

```ts
import { Local, UTC, fixedZone, loadLocation, now } from "go-time";

const t = now();

const utc = t.in(UTC);
const local = t.in(Local);
const est = t.in(fixedZone("EST", -5 * 3600));
const berlin = t.in(loadLocation("Europe/Berlin"));

console.log(utc.zone()); // ["UTC", 0]
console.log(local.zone()); // e.g. ["Local", -25200]
console.log(est.zone()); // ["EST", -18000]
console.log(berlin.zone()); // e.g. ["Europe/Berlin", 7200]
```

### Timers and Tickers

```ts
import { newTicker, newTimer, parseDuration } from "go-time";

const timer = newTimer(parseDuration("50ms"));
const firedAt = await timer.C.recv();
console.log(firedAt.unixNano()); // e.g. 1775649011123456789n

const ticker = newTicker(parseDuration("100ms"));
let count = 0;
for await (const tick of ticker.C) {
  console.log(tick.unixNano()); // e.g. 1775649011223456789n
  count += 1;
  if (count === 3) {
    ticker.stop();
    break;
  }
}
```

## Exported API

### Duration APIs

- `Duration`
- `parseDuration(input)`
- `Nanosecond`, `Microsecond`, `Millisecond`, `Second`, `Minute`, `Hour`

### Time APIs

- `Time`
- `now()`
- `date(year, month, day, hour, min, sec, nsec, loc?)`
- `unix(sec, nsec?)`, `unixMilli(ms)`, `unixMicro(us)`
- `parse(layout, value)`, `parseInLocation(layout, value, loc)`
- `since(t)`, `until(t)`, `sleep(duration)`
- `Month`, `Weekday`

### Layout Constants

- `Layout`, `ANSIC`, `UnixDate`, `RubyDate`
- `RFC822`, `RFC822Z`, `RFC850`, `RFC1123`, `RFC1123Z`
- `RFC3339`, `RFC3339Nano`
- `Kitchen`, `Stamp`, `StampMilli`, `StampMicro`, `StampNano`
- `DateTime`, `DateOnly`, `TimeOnly`

### Location APIs

- `Location`
- `UTC`, `Local`
- `fixedZone(name, offsetSeconds)`
- `loadLocation(name)`
- `loadLocationFromTZData(name, data)` (currently not implemented)

### Timer APIs

- `Timer`, `Ticker`
- `newTimer(duration)`, `after(duration)`, `afterFunc(duration, fn)`
- `newTicker(duration)`, `tick(duration)`

## Development

Install dependencies:

```bash
npm install
```

Available scripts:

- `npm run build` - compile TypeScript to `dist/`
- `npm run clean` - remove `dist/`
- `npm run lint` - run ESLint on source and tests
- `npm run lint:fix` - run ESLint with auto-fixes
- `npm run format` - format files with Prettier
- `npm run format:check` - verify formatting
- `npm run typecheck` - TypeScript type checks without emitting files
- `npm test` - build and run Node test suite from compiled output

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Add or update tests in `test/`.
4. Run `npm run lint`, `npm run typecheck`, and `npm test`.
5. Open a pull request describing your changes.

## License

MIT. See `LICENSE`.
