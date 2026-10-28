import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {computeCpuPct, computeNetRates, computeRamUsage, countUserTerminals, extractCounters, parseGpuCsv, parsePtyStat} from './computeUsage.js'

// A realistic /containers/{id}/stats payload subset (cgroup v2, one-shot).
const stats = ({cpuTotal, systemTotal, onlineCpus = 4, usage = 2_000_000_000, inactiveFile = 500_000_000, networks} = {}) => ({
    cpu_stats: {
        cpu_usage: {total_usage: cpuTotal},
        system_cpu_usage: systemTotal,
        online_cpus: onlineCpus,
    },
    memory_stats: {
        usage,
        stats: {inactive_file: inactiveFile},
    },
    networks: networks ?? {eth0: {rx_bytes: 1000, tx_bytes: 2000}},
})

describe('extractCounters', () => {
    it('extracts cpu/system/net counters', () => {
        const c = extractCounters(stats({cpuTotal: 10, systemTotal: 100}))
        assert.deepEqual(
            c,
            {cpuTotal: 10, systemTotal: 100, onlineCpus: 4, rxBytes: 1000, txBytes: 2000}
        )
    })
    it('sums network counters across interfaces', () => {
        const c = extractCounters(stats({networks: {
            eth0: {rx_bytes: 1000, tx_bytes: 2000},
            eth1: {rx_bytes: 10, tx_bytes: 20},
        }}))
        assert.equal(c.rxBytes, 1010)
        assert.equal(c.txBytes, 2020)
    })
    it('returns nulls for a malformed payload', () => {
        assert.deepEqual(
            extractCounters({}),
            {cpuTotal: null, systemTotal: null, onlineCpus: null, rxBytes: null, txBytes: null}
        )
    })
})

describe('computeCpuPct', () => {
    // Container used 2s of CPU while the 4-cpu host accumulated 40s (10s×4):
    // 2/40 × 4 = 0.2 cores; on a 4-cpu instance → 5%.
    it('computes interval-average percentage of the whole instance', () => {
        const prev = {cpuTotal: 0, systemTotal: 0}
        const current = {cpuTotal: 2e9, systemTotal: 40e9, onlineCpus: 4}
        assert.equal(computeCpuPct(prev, current, 4), 5)
    })
    it('clamps to 100', () => {
        const prev = {cpuTotal: 0, systemTotal: 0}
        const current = {cpuTotal: 50e9, systemTotal: 40e9, onlineCpus: 4}
        assert.equal(computeCpuPct(prev, current, 4), 100)
    })
    it('returns null without a baseline or on counter reset', () => {
        assert.equal(computeCpuPct(null, {cpuTotal: 1, systemTotal: 1, onlineCpus: 1}, 1), null)
        assert.equal(
            computeCpuPct({cpuTotal: null, systemTotal: null}, {cpuTotal: 1, systemTotal: 1, onlineCpus: 1}, 1),
            null
        )
        assert.equal(
            computeCpuPct({cpuTotal: 100, systemTotal: 100}, {cpuTotal: 50, systemTotal: 200, onlineCpus: 1}, 1),
            null
        )
        assert.equal(
            computeCpuPct({cpuTotal: 0, systemTotal: 100}, {cpuTotal: 1, systemTotal: 100, onlineCpus: 1}, 1),
            null
        )
    })
})

describe('computeRamUsage', () => {
    it('subtracts inactive_file and computes pct of instance RAM', () => {
        const {ramBytes, ramPct} = computeRamUsage(stats(), 4 * 2 ** 30)
        assert.equal(ramBytes, 1_500_000_000)
        assert.equal(ramPct, 34.92)
    })
    it('returns nulls when memory stats are missing', () => {
        assert.deepEqual(computeRamUsage({}, 4 * 2 ** 30), {ramBytes: null, ramPct: null})
    })
})

describe('computeNetRates', () => {
    it('computes per-second rates from counter deltas', () => {
        const prev = {rxBytes: 1000, txBytes: 2000}
        const current = {rxBytes: 7000, txBytes: 5000}
        assert.deepEqual(
            computeNetRates(prev, current, 60),
            {netRxBytesPerS: 100, netTxBytesPerS: 50}
        )
    })
    it('returns nulls without a baseline or on reset', () => {
        assert.deepEqual(
            computeNetRates(null, {rxBytes: 1, txBytes: 1}, 60),
            {netRxBytesPerS: null, netTxBytesPerS: null}
        )
        assert.deepEqual(
            computeNetRates({rxBytes: 100, txBytes: 100}, {rxBytes: 50, txBytes: 200}, 60),
            {netRxBytesPerS: null, netTxBytesPerS: null}
        )
    })
})

describe('parseGpuCsv', () => {
    it('averages utilization and sums memory across GPUs', () => {
        const result = parseGpuCsv('45, 1024\r\n55, 2048\r\n')
        assert.equal(result.gpuPct, 50)
        assert.equal(result.gpuRamBytes, 3072 * 1024 * 1024)
    })
    it('returns null on empty or unparseable output', () => {
        assert.equal(parseGpuCsv(''), null)
        assert.equal(parseGpuCsv('NVIDIA-SMI has failed'), null)
        assert.equal(parseGpuCsv(null), null)
    })
})

describe('parsePtyStat', () => {
    const NOW = new Date('2026-08-13T12:00:00Z')
    const epoch = offsetSeconds => Math.floor(NOW.getTime() / 1000) + offsetSeconds
    const parse = text => parsePtyStat(text, {now: NOW, tickSeconds: 60})

    it('returns the most recent atime across the ptys', () => {
        const out = [
            `${epoch(-300)} ${epoch(-3600)} /dev/pts/0`,
            `${epoch(-30)} ${epoch(-3600)} /dev/pts/3`,
        ].join('\n')
        assert.equal(parse(out), epoch(-30))
    })

    // The exec runs with Tty: false, so stdout arrives multiplexed in 8-byte frame headers whose
    // bytes land in the decoded text as noise. Records are extracted by pattern for exactly this
    // reason — a mangled header cannot corrupt a timestamp.
    it('survives the multiplexed stream framing', () => {
        const framed = `\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0028${epoch(-30)} ${epoch(-3600)} /dev/pts/3\n`
        assert.equal(parse(framed), epoch(-30))
    })

    // A Tty: true exec allocates a pty inside the container with atime = the moment of the exec.
    // Reading it would return `now` on every tick, every session would be extended forever, and
    // nothing would log an error. ctime is the discriminator: a real terminal's ctime is its
    // allocation time and never moves.
    it('ignores a pty created within this tick', () => {
        const out = [
            `${epoch(-300)} ${epoch(-3600)} /dev/pts/0`,
            `${epoch(0)} ${epoch(0)} /dev/pts/9`,
        ].join('\n')
        assert.equal(parse(out), epoch(-300))
    })

    it('keeps a long-lived pty whose atime moved just now', () => {
        assert.equal(parse(`${epoch(-1)} ${epoch(-3600)} /dev/pts/3`), epoch(-1))
    })

    it('returns null when there is nothing to read', () => {
        assert.equal(parse(''), null)
        assert.equal(parse(null), null)
        assert.equal(parse('stat: cannot stat'), null)
        assert.equal(parse(`${epoch(0)} ${epoch(0)} /dev/pts/9`), null)
    })
})

describe('countUserTerminals', () => {
    // A pty starts with atime == mtime == ctime. Program output moves only mtime; user input moves
    // only atime. So atime > ctime means "someone has typed on this one" — a live terminal — while
    // the supervised services holding pts/0-2 stay level however much they print.
    it('counts only the ptys that have had input', () => {
        const out = [
            '1000 1000 /dev/pts/0',   // service, never typed into
            '1000 1000 /dev/pts/1',   // service
            '1500 1000 /dev/pts/2',   // a user terminal
            '1600 1000 /dev/pts/3',   // another user terminal
        ].join('\n')
        assert.equal(countUserTerminals(out), 2)
    })

    it('is zero when nothing has been typed into', () => {
        assert.equal(countUserTerminals('1000 1000 /dev/pts/0\n1000 1000 /dev/pts/1'), 0)
    })

    it('is zero for empty or unreadable output', () => {
        assert.equal(countUserTerminals(''), 0)
        assert.equal(countUserTerminals(null), 0)
        assert.equal(countUserTerminals('stat: cannot stat'), 0)
    })

    // The same multiplexed framing parsePtyStat copes with.
    it('survives the exec stream framing', () => {
        assert.equal(countUserTerminals('\u0001\u0000\u0000\u00001500 1000 /dev/pts/3\n'), 1)
    })
})
