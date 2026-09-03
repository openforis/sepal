// computeUsage — pure math for the usage sampler.
//
// CPU and network come from CUMULATIVE counters: the sampler keeps the previous tick's
// extractCounters() result and passes it as `prev`, so each value is the true average
// over the whole sampling interval (no point-sample aliasing). A missing baseline or a
// counter going backwards (container restart) yields null — recorded as "not measured".
//
// RAM subtracts inactive_file from usage (the cAdvisor-style correction: page cache is
// reclaimable and must not read as load). The /ram tmpfs and ShmSize count toward usage —
// deliberate, tmpfs is real RAM.

const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100

const clampPct = value => round2(Math.min(100, Math.max(0, value)))

const getNetworkTraffic = networks =>
    networks && Object.keys(networks).length
        ? Object.values(networks).reduce((acc, iface) => ({
            rxBytes: acc.rxBytes + (iface?.rx_bytes ?? 0),
            txBytes: acc.txBytes + (iface?.tx_bytes ?? 0)
        }), {rxBytes: 0, txBytes: 0})
        : {rxBytes: null, txBytes: null}

const extractCounters = stats => {
    const networks = stats?.networks
    const {rxBytes, txBytes} = getNetworkTraffic(networks)
    return {
        cpuTotal: stats?.cpu_stats?.cpu_usage?.total_usage ?? null,
        systemTotal: stats?.cpu_stats?.system_cpu_usage ?? null,
        onlineCpus: stats?.cpu_stats?.online_cpus ?? null,
        rxBytes,
        txBytes,
    }
}

const computeCpuPct = (prev, current, cpuCount) => {
    if (!prev || prev.cpuTotal == null || prev.systemTotal == null
        || current.cpuTotal == null || current.systemTotal == null
        || !current.onlineCpus || !cpuCount) {
        return null
    }
    const cpuDelta = current.cpuTotal - prev.cpuTotal
    const systemDelta = current.systemTotal - prev.systemTotal
    if (cpuDelta < 0 || systemDelta <= 0) {
        return null
    }
    const coresUsed = cpuDelta / systemDelta * current.onlineCpus
    return clampPct(coresUsed / cpuCount * 100)
}

const computeRamUsage = (stats, instanceRamBytes) => {
    const usage = stats?.memory_stats?.usage
    if (usage == null) {
        return {ramBytes: null, ramPct: null}
    }
    const inactiveFile = stats?.memory_stats?.stats?.inactive_file ?? 0
    const ramBytes = Math.max(0, usage - inactiveFile)
    const ramPct = instanceRamBytes ? clampPct(ramBytes / instanceRamBytes * 100) : null
    return {ramBytes, ramPct}
}

const computeNetRates = (prev, current, elapsedSeconds) => {
    if (!prev || prev.rxBytes == null || prev.txBytes == null
        || current.rxBytes == null || current.txBytes == null
        || !(elapsedSeconds > 0)) {
        return {netRxBytesPerS: null, netTxBytesPerS: null}
    }
    const rxDelta = current.rxBytes - prev.rxBytes
    const txDelta = current.txBytes - prev.txBytes
    if (rxDelta < 0 || txDelta < 0) {
        return {netRxBytesPerS: null, netTxBytesPerS: null}
    }
    return {
        netRxBytesPerS: Math.round(rxDelta / elapsedSeconds),
        netTxBytesPerS: Math.round(txDelta / elapsedSeconds),
    }
}

// parseGpuCsv — output of `nvidia-smi --query-gpu=utilization.gpu,memory.used
// --format=csv,noheader,nounits`: one "util, memMiB" line per GPU (Tty exec → \r\n).
const parseGpuCsv = text => {
    if (!text || typeof text !== 'string') {
        return null
    }
    const gpus = text.split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const [util, mem] = line.split(',').map(part => Number(part.trim()))
            return Number.isFinite(util) && Number.isFinite(mem) ? {util, mem} : null
        })
    if (!gpus.length || gpus.some(gpu => gpu === null)) {
        return null
    }
    const gpuPct = clampPct(gpus.reduce((acc, {util}) => acc + util, 0) / gpus.length)
    const gpuRamBytes = gpus.reduce((acc, {mem}) => acc + mem, 0) * 1024 * 1024
    return {gpuPct, gpuRamBytes}
}

// parsePtyStat — output of `stat -c "%X %Z %n" /dev/pts/[0-9]*`, returning the most recent atime
// in epoch SECONDS, or null when no pty qualifies.
//
// The exec runs with Tty: false, so stdout arrives multiplexed in 8-byte frame headers whose bytes
// land in the decoded text as noise. Records are therefore EXTRACTED by pattern rather than parsed
// line by line, which is also why a partially mangled header cannot corrupt a timestamp.
//
// A pty whose ctime falls inside the current tick is skipped: the sampler's own exec pty lingers
// briefly and would read as a keystroke. A real terminal's ctime is its allocation time and never
// moves (tty_update_time writes atime/mtime directly), so this only ever discards ptys created
// moments ago — and a brand-new terminal is already covered by ssh-gateway's one-shot
// "terminal opened" extension.
const PTY_STAT_RECORD = /(\d+)\s+(\d+)\s+(\/dev\/pts\/\d+)/g

const parsePtyStat = (text, {now = new Date(), tickSeconds = 60} = {}) => {
    if (!text || typeof text !== 'string') {
        return null
    }
    const freshCtimeCutoff = Math.floor(now.getTime() / 1000) - tickSeconds
    let maxAtime = null
    for (const [, atime, ctime] of text.matchAll(PTY_STAT_RECORD)) {
        if (Number(ctime) >= freshCtimeCutoff) {
            continue // created within this tick — possibly our own exec pty
        }
        const value = Number(atime)
        if (Number.isFinite(value) && (maxAtime === null || value > maxAtime)) {
            maxAtime = value
        }
    }
    return maxAtime
}

// countUserTerminals — how many of the container's ptys are terminals someone has actually typed
// into, from the same `stat` output parsePtyStat reads.
//
// The discriminator is atime > ctime. A pty is allocated with atime == mtime == ctime; program
// output moves only mtime, and user input moves only atime. So a pty whose atime has overtaken its
// ctime has had input consumed on it — which is exactly a live terminal session — while the
// supervised services holding pts/0-2 in a sandbox stay at atime == ctime however much they print.
//
// Two limits worth knowing, both inherited from the signal itself: a terminal opened but never
// typed into does not count, and any service that READS from its controlling tty would count. The
// second is the same watch-item §4b already records for the interaction signal.
const countUserTerminals = text => {
    if (!text || typeof text !== 'string') {
        return 0
    }
    let count = 0
    for (const [, atime, ctime] of text.matchAll(PTY_STAT_RECORD)) {
        if (Number(atime) > Number(ctime)) {
            count++
        }
    }
    return count
}

export {computeCpuPct, computeNetRates, computeRamUsage, countUserTerminals, extractCounters, parseGpuCsv, parsePtyStat}
