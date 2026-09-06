const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
]

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

// `epochSeconds` matches the D1 `unixepoch()` timestamps the API returns.
export function relativeTime(epochSeconds: number): string {
  const diffSeconds = epochSeconds - Math.floor(Date.now() / 1000)
  for (const [unit, secondsInUnit] of UNITS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return formatter.format(Math.round(diffSeconds / secondsInUnit), unit)
    }
  }
  return formatter.format(0, "minute")
}
