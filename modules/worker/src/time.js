// The millisecond durations the schedulers, the sweeps and the usage rollups are all expressed in.
// One definition, because a job scheduled in one file is reasoned about against a window computed
// in another.

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export {DAY_MS, HOUR_MS, MINUTE_MS}
