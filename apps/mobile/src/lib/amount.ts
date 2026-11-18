/**
 * Turn what someone typed on a phone's decimal pad into "1234.56" for
 * `toMinorUnits`. The pad's decimal key types the device's separator, a
 * comma in much of the world, and `toMinorUnits` reads commas as thousands
 * separators: "18,40" would become 1840.00.
 *
 * Rules: spaces (and non-breaking ones) go; with both "." and "," the last
 * one is the decimal point and the other is grouping; a lone "," is the
 * decimal point when one or two digits follow it (more digits read as
 * grouping, "1,234").
 */
export function normalizeAmount(input: string): string {
  const s = input.replace(/[\s  ]/g, "")
  const dot = s.lastIndexOf(".")
  const comma = s.lastIndexOf(",")
  if (dot >= 0 && comma >= 0) {
    return dot > comma
      ? s.replace(/,/g, "")
      : s.replace(/\./g, "").replace(",", ".")
  }
  if (comma >= 0 && s.indexOf(",") === comma && s.length - comma - 1 <= 2)
    return s.replace(",", ".")
  return s.replace(/,/g, "")
}
