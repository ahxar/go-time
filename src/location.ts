/**
 * Represents a geographic time zone, either as a named IANA zone (e.g.
 * `"America/New_York"`) or as a fixed UTC offset.
 */
export class Location {
  /** The IANA time zone name or a descriptive label for fixed-offset zones. */
  readonly name: string;
  /**
   * Fixed UTC offset in seconds east of UTC, or `undefined` for named zones
   * where the offset is determined dynamically.
   */
  readonly fixedOffsetSeconds: number | undefined;

  constructor(name: string, fixedOffsetSeconds?: number) {
    this.name = name;
    this.fixedOffsetSeconds = fixedOffsetSeconds;
  }

  /** Returns the location name. */
  toString(): string {
    return this.name;
  }
}

/** The UTC time zone (offset 0). */
export const UTC = new Location("UTC", 0);
/** The local system time zone, resolved at runtime via `Intl`. */
export const Local = new Location("Local");

/**
 * Returns a {@link Location} with the given name and a fixed UTC offset.
 *
 * @param name - A descriptive label for the zone (e.g. `"EST"`).
 * @param offsetSeconds - Seconds east of UTC (negative values are west).
 *
 * @example
 * ```ts
 * const est = fixedZone("EST", -5 * 3600);
 * ```
 */
export function fixedZone(name: string, offsetSeconds: number): Location {
  return new Location(name, offsetSeconds);
}

/**
 * Returns a {@link Location} for the named IANA time zone.
 *
 * The name is validated via `Intl.DateTimeFormat`. Passing `""` or `"UTC"`
 * returns {@link UTC}; passing `"Local"` returns {@link Local}.
 *
 * @param name - IANA time zone name, e.g. `"Europe/Paris"`.
 * @returns The resolved {@link Location}.
 * @throws {Error} If the name is not a valid IANA time zone.
 */
export function loadLocation(name: string): Location {
  if (name === "" || name === "UTC") {
    return UTC;
  }

  if (name === "Local") {
    return Local;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name }).format(new Date());
    return new Location(name);
  } catch {
    throw new Error(`unknown time zone: ${name}`);
  }
}

/**
 * Not yet implemented. Throws an error in all cases.
 *
 * @throws {Error} Always — `LoadLocationFromTZData` is not implemented in v0.1.0.
 * @param _name - Unused.
 * @param _data - Unused.
 */
export function loadLocationFromTZData(_name: string, _data: Uint8Array): never {
  throw new Error("LoadLocationFromTZData is not implemented in v0.1.0");
}
