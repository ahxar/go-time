/**
 * Layout strings used with {@link Time.format} and {@link parse}.
 *
 * Each constant is a reference time string in the Go `time` package convention,
 * where the reference moment is `Mon Jan 2 15:04:05 MST 2006` (Unix time
 * 1136239445). Pass these constants as the `layout` argument to format or parse
 * a `Time` value.
 *
 * @example
 * ```ts
 * now().format(RFC3339); // "2026-04-08T12:00:00.000Z"
 * parse(DateOnly, "2026-04-08");
 * ```
 */

/** General-purpose layout: `"01/02 03:04:05PM '06 -0700"`. */
export const Layout = "01/02 03:04:05PM '06 -0700";
/** ANSI C date format: `"Mon Jan _2 15:04:05 2006"`. */
export const ANSIC = "Mon Jan _2 15:04:05 2006";
/** Unix `date` command format: `"Mon Jan _2 15:04:05 MST 2006"`. */
export const UnixDate = "Mon Jan _2 15:04:05 MST 2006";
/** Ruby `Date#to_s` format: `"Mon Jan 02 15:04:05 -0700 2006"`. */
export const RubyDate = "Mon Jan 02 15:04:05 -0700 2006";
/** RFC 822 with abbreviated timezone: `"02 Jan 06 15:04 MST"`. */
export const RFC822 = "02 Jan 06 15:04 MST";
/** RFC 822 with numeric timezone: `"02 Jan 06 15:04 -0700"`. */
export const RFC822Z = "02 Jan 06 15:04 -0700";
/** RFC 850 / obsolete RFC 1036: `"Monday, 02-Jan-06 15:04:05 MST"`. */
export const RFC850 = "Monday, 02-Jan-06 15:04:05 MST";
/** RFC 1123 with abbreviated timezone: `"Mon, 02 Jan 2006 15:04:05 MST"`. */
export const RFC1123 = "Mon, 02 Jan 2006 15:04:05 MST";
/** RFC 1123 with numeric timezone: `"Mon, 02 Jan 2006 15:04:05 -0700"`. */
export const RFC1123Z = "Mon, 02 Jan 2006 15:04:05 -0700";
/** RFC 3339 / ISO 8601: `"2006-01-02T15:04:05Z07:00"`. */
export const RFC3339 = "2006-01-02T15:04:05Z07:00";
/** 12-hour clock format: `"3:04PM"`. */
export const Kitchen = "3:04PM";
/** Abbreviated month, day, and time: `"Jan _2 15:04:05"`. */
export const Stamp = "Jan _2 15:04:05";
/** {@link Stamp} with millisecond precision: `"Jan _2 15:04:05.000"`. */
export const StampMilli = "Jan _2 15:04:05.000";
/** Date and time without timezone: `"2006-01-02 15:04:05"`. */
export const DateTime = "2006-01-02 15:04:05";
/** Date only: `"2006-01-02"`. */
export const DateOnly = "2006-01-02";
/** Time only: `"15:04:05"`. */
export const TimeOnly = "15:04:05";
