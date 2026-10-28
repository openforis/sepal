// isBusy — a POSITIVE predicate over instance_usage_sample (docs/session-expiration-model.md §3).
//
// Deliberately not `!isIdle`. The idle verdict is fail-safe in one direction only: missing samples
// read as "not idle", which spares a session. Feeding `!isIdle` into a deadline would invert that
// fail-safe and make an unreachable instance immortal.
//
// Thresholds are ABSOLUTE, not proportional. The idle policy's percent-of-instance CPU fails in
// both directions at once: three idle app tabs read as 1.5 % on a 2-core instance (busy enough to
// pin it, once ~10 tabs are open) while a genuine one-core job reads as 1.6 % on a 64-core
// instance (idle enough to kill it). What matters — how much work is happening — is absolute, so
// the verdict thresholds cores used, recovered from the stored percentage and the instance's core
// count. Network likewise: the measured idle floor is ~4.9 KB/s per open app, and real transfers
// run at MB/s, so the threshold sits far above polling rather than 3.4× above it.
//
// RAM is sampled but excluded: it is a level, not a rate. A finished process that has not exited
// holds its heap indefinitely, so a RAM threshold would keep dead sessions alive — the exact
// failure the positive predicate exists to avoid.
//
// GPU is already device-absolute (mean utilization across devices) and needs no conversion.
// Attribution is unambiguous only because at most one ACTIVE session is bound to an instance; if
// that ever stops holding, the metric stops meaning anything.

const COVERAGE = 0.8
const EDGE_TRIM = 2

// requiredSamplesFor — the coverage floor: 80 % of a window's EFFECTIVELY VISIBLE samples. The
// sweep and the sampler share a cadence and the window-edge sample can fall out on second-precision
// boundaries, so ~2 samples per window are structurally invisible.
const requiredSamplesFor = (windowMinutes, samplingIntervalSeconds) =>
    COVERAGE * Math.max(1, windowMinutes * 60 / samplingIntervalSeconds - EDGE_TRIM)

// coresUsed — the sampler stores cpu_pct as coresUsed / instance_cores × 100 (computeCpuPct), so
// the absolute quantity is recovered rather than re-measured.
const coresUsed = (cpuAvgPct, instanceCores) =>
    cpuAvgPct == null || !instanceCores ? null : cpuAvgPct / 100 * instanceCores

// isBusy — {busy, coverage} for one session over the window.
//
// coverage=false is NOT the same as busy=false: a Docker-API blip must not close a computing
// instance, so the caller treats missing coverage as busy for a bounded number of consecutive
// ticks (unknownBusyGraceTicks) rather than letting it decide anything.
const isBusy = ({stats, instanceType, policy, requiredSamples}) => {
    if (!stats || stats.samples < requiredSamples) {
        return {busy: false, coverage: false}
    }
    const cores = coresUsed(stats.cpuAvg, instanceType?.cpuCount)
    if (cores !== null && cores >= policy.busyCpuCores) {
        return {busy: true, coverage: true}
    }
    if (instanceType?.gpuCount > 0
        && stats.gpuSamples >= requiredSamples
        && stats.gpuAvg !== null
        && stats.gpuAvg >= policy.busyGpuThresholdPct) {
        return {busy: true, coverage: true}
    }
    if (stats.netAvg !== null && stats.netAvg >= policy.busyNetworkThresholdKBps * 1024) {
        return {busy: true, coverage: true}
    }
    return {busy: false, coverage: true}
}

export {coresUsed, isBusy, requiredSamplesFor}
