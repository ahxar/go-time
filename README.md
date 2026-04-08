# go-time

[![CI and Release](https://github.com/ahxar/go-time/actions/workflows/ci-release.yml/badge.svg)](https://github.com/ahxar/go-time/actions/workflows/ci-release.yml)
[![npm version](https://img.shields.io/npm/v/%40ahxar%2Fgo-time)](https://www.npmjs.com/package/@ahxar/go-time)
[![npm downloads](https://img.shields.io/npm/dm/%40ahxar%2Fgo-time)](https://www.npmjs.com/package/@ahxar/go-time)
[![License](https://img.shields.io/github/license/ahxar/go-time)](LICENSE)

Go-inspired time utilities for Node.js with TypeScript types and zero runtime dependencies.

`go-time` brings familiar Go `time` concepts to JavaScript and TypeScript: durations, layouts, parsing/formatting, locations, timers, and tickers.

Precision note: `go-time` is built on JavaScript `Date`, so wall-clock time values are limited to millisecond precision.

## Features

- Go-style duration values and parser (`2h45m10.5s`)
- `Time` API for millisecond-precision arithmetic, comparisons, rounding, truncation, and calendar fields
- Monotonic clock support for stable elapsed-time measurement with `now()`, `sub()`, `since()`, and `until()`
- Layout-based parse/format helpers (`RFC3339`, `DateTime`, `Kitchen`, and more)
- Time zone support with UTC, local, fixed offsets, and IANA zone names
- Timer and ticker primitives inspired by Go channels
- ESM-first package with generated TypeScript declarations
- No runtime dependencies

## Installation

```bash
npm install @ahxar/go-time
```

## Requirements

- Node.js 20+

## Quick Start

```ts
import {
  DateTime,
  Month,
  RFC3339,
  date,
  now,
  parse,
  parseDuration,
  since,
  sleep,
  unixMilli,
} from "@ahxar/go-time";

const started = now();

const timeout = parseDuration("250ms");
await sleep(timeout);

const elapsed = since(started);
console.log(elapsed.toString()); // e.g. "252.3ms"

const t1 = parse(RFC3339, "2026-04-08T09:10:11.123Z");
console.log(t1.millisecond()); // 123

const t2 = date(2026, Month.April, 8, 12, 30, 0, 0);
console.log(t2.format(DateTime)); // "2026-04-08 12:30:00"

const t3 = unixMilli(1_700_000_000_123n);
console.log(t3.unixMilli()); // 1700000000123n
```

## Core Concepts

### Duration

```ts
import { Duration, Hour, Minute, Second, parseDuration } from "@ahxar/go-time";

const a = parseDuration("2h45m10.5s");
const b = new Duration(90n * Second);
const c = new Duration(1n * Hour + 30n * Minute);

console.log(a.milliseconds()); // 9910500n
console.log(b.round(new Duration(1n * Second)).toString()); // "1m30s"
console.log(c.truncate(new Duration(1n * Minute)).toString()); // "1h30m0s"
```

Supported units: `ms`, `s`, `m`, `h`.

### Time and Layouts

`Time` uses JavaScript `Date` under the hood, so parsing, formatting, constructors, and current-time reads only support millisecond precision.

```ts
import {
  DateOnly,
  DateTime,
  Kitchen,
  RFC3339,
  parse,
  parseInLocation,
  fixedZone,
} from "@ahxar/go-time";

const t = parse(RFC3339, "2026-04-08T09:10:11.123Z");

console.log(t.format(DateOnly)); // "2026-04-08"
console.log(t.format(DateTime)); // "2026-04-08 09:10:11"
console.log(t.format(Kitchen)); // "9:10AM"
console.log(t.format(RFC3339)); // "2026-04-08T09:10:11.123Z"

const plus2 = fixedZone("PLUS2", 2 * 3600);
const localClock = parseInLocation(DateTime, "2026-04-08 12:00:00", plus2);
console.log(localClock.zone()); // { name: "PLUS2", offsetSeconds: 7200 }
```

### Monotonic Time

`now()` records both wall-clock time and a monotonic reading. When two `Time` values both carry monotonic data, `sub()`, `since()`, and `until()` use the monotonic clock for elapsed-time calculations instead of wall-clock time.

This makes elapsed-time measurement stable across wall-clock adjustments. Times created with `unix()`, `unixMilli()`, `date()`, or `parse()` do not include monotonic data.

```ts
import { now, parseDuration, since, sleep, unix } from "@ahxar/go-time";

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
import { Local, UTC, fixedZone, loadLocation, now } from "@ahxar/go-time";

const t = now();

const utc = t.in(UTC);
const local = t.in(Local);
const est = t.in(fixedZone("EST", -5 * 3600));
const berlin = t.in(loadLocation("Europe/Berlin"));

console.log(utc.zone()); // { name: "UTC", offsetSeconds: 0 }
console.log(local.zone()); // e.g. { name: "Local", offsetSeconds: -25200 }
console.log(est.zone()); // { name: "EST", offsetSeconds: -18000 }
console.log(berlin.zone()); // e.g. { name: "Europe/Berlin", offsetSeconds: 7200 }
```

### Timers and Tickers

```ts
import { newTicker, newTimer, parseDuration } from "@ahxar/go-time";

const timer = newTimer(parseDuration("50ms"));
const firedAt = await timer.C.recv();
console.log(firedAt.unixMilli()); // e.g. 1775649011123n

const ticker = newTicker(parseDuration("100ms"));
let count = 0;
for await (const tick of ticker.C) {
  console.log(tick.unixMilli()); // e.g. 1775649011223n
  count += 1;
  if (count === 3) {
    ticker.stop();
    break;
  }
}
```

## Development

Install dependencies:

```bash
npm install
```

Available scripts:

- `npm run build` - compile the publishable package to `dist/`
- `npm run check` - TypeScript type checks without emitting files
- `npm run fmt` - format supported files with Oxc
- `npm run fmt:check` - verify formatting without writing changes
- `npm run lint` - run Oxlint across the repository
- `npm run lint:fix` - run Oxlint with auto-fixes
- `npm test` - run the Vitest suite directly from the TypeScript test files

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Add or update tests in `test/`.
4. Run `npm run lint`, `npm run check`, and `npm test`.
5. Open a pull request describing your changes.

## License

MIT. See `LICENSE`.
