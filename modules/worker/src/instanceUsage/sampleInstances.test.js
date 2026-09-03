import {createBusyRegistry} from './busyRegistry.js'
import {sampleInstances} from './sampleInstances.js'

const T3 = {id: 'T3aSmall', cpuCount: 2, ramBytes: 2 * 2 ** 30, gpuCount: 0}
const G5 = {id: 'G5Xlarge', cpuCount: 4, ramBytes: 16 * 2 ** 30, gpuCount: 1}

const session = overrides => ({
    id: 's1', username: 'alice', workerType: 'sandbox', instanceType: 'T3aSmall',
    instance: {id: 'i-1', host: '1.2.3.4'},
    ...overrides,
})

const statsPayload = ({cpuTotal, systemTotal, rx = 0, tx = 0}) => ({
    cpu_stats: {cpu_usage: {total_usage: cpuTotal}, system_cpu_usage: systemTotal, online_cpus: 2},
    memory_stats: {usage: 1 * 2 ** 30, stats: {inactive_file: 0}},
    networks: {eth0: {rx_bytes: rx, tx_bytes: tx}},
})

const deps = ({sessions, statsBySession, gpuText, ptyText, windowStats}) => {
    const inserted = []
    const metricUpdates = []
    const extensions = []
    return {
        inserted,
        metricUpdates,
        extensions,
        deps: {
            sessionRepo: {
                sessions: async () => sessions,
                extendSession: async args => { extensions.push(args); return true },
            },
            usageRepo: {
                insertSample: async sample => inserted.push(sample),
                busyWindowStats: async () => windowStats ?? new Map(),
            },
            stats: {
                containerStats: async ({id}) => {
                    const result = statsBySession[id]
                    if (result instanceof Error) throw result
                    return result
                },
                gpuStats: async () => {
                    if (gpuText instanceof Error) throw gpuText
                    return gpuText
                },
                ptyStats: async () => {
                    if (ptyText instanceof Error) throw ptyText
                    return ptyText
                },
            },
            instanceTypeById: {T3aSmall: T3, G5Xlarge: G5},
            usageMetrics: {update: samples => metricUpdates.push(samples)},
            samplerState: new Map(),
        },
    }
}

// The expiry policy the tick applies. Distinct magnitudes so a test can tell WHICH ratchet fired.
const policy = {
    interactionExtensionMinutes: 16,
    busyExtensionMinutes: 17,
    maxUnattendedHours: 12,
    busyWindowMinutes: 10,
    unknownBusyGraceTicks: 2,
    samplingIntervalSeconds: 60,
    busyCpuCores: 0.5,
    busyGpuThresholdPct: 5,
    busyNetworkThresholdKBps: 500,
}

const ptyLine = (atimeSeconds, ctimeSeconds) => `${atimeSeconds} ${ctimeSeconds} /dev/pts/3`

describe('sampleInstances', () => {
    it('records a baseline on the first tick and a full sample on the second', async () => {
        const t0 = new Date('2026-08-01T10:00:00Z')
        const t1 = new Date('2026-08-01T10:01:00Z')
        const {inserted, deps: d} = deps({
            sessions: [session()],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0, rx: 0, tx: 0})},
        })
        await sampleInstances({...d, clock: () => t0})
        expect(inserted).toHaveLength(0)
        expect(d.samplerState.get('s1')).toBeDefined()

        // Second tick: container used 12s CPU of 120s system (2 cpus → 60s wall)
        // → 0.2 cores → 10% of a 2-cpu instance; 60_000 rx bytes over 60s → 1000 B/s.
        d.stats.containerStats = async () =>
            statsPayload({cpuTotal: 12e9, systemTotal: 120e9, rx: 60_000, tx: 6_000})
        await sampleInstances({...d, clock: () => t1})
        expect(inserted).toHaveLength(1)
        const sample = inserted[0]
        expect(sample.sessionId).toBe('s1')
        expect(sample.username).toBe('alice')
        expect(sample.instanceType).toBe('T3aSmall')
        expect(sample.sampleTime).toEqual(t1)
        expect(sample.cpuPct).toBe(10)
        expect(sample.ramPct).toBe(50)
        expect(sample.netRxBytesPerS).toBe(1000)
        expect(sample.netTxBytesPerS).toBe(100)
        expect(sample.gpuPct).toBeNull()
    })

    it('samples GPU only for GPU instance types and tolerates nvidia-smi failure', async () => {
        const t = ms => new Date(ms)
        const {inserted, deps: d} = deps({
            sessions: [session({id: 'g1', instanceType: 'G5Xlarge', instance: {id: 'i-g', host: 'h'}})],
            statsBySession: {g1: statsPayload({cpuTotal: 0, systemTotal: 0})},
            gpuText: '45, 1024\r\n',
        })
        await sampleInstances({...d, clock: () => t(0)})
        d.stats.containerStats = async () => statsPayload({cpuTotal: 1e9, systemTotal: 100e9})
        await sampleInstances({...d, clock: () => t(60_000)})
        expect(inserted[0].gpuPct).toBe(45)
        expect(inserted[0].gpuRamBytes).toBe(1024 * 1024 * 1024)

        // nvidia-smi failure → gpu fields null, sample still recorded.
        d.stats.gpuStats = async () => {
            throw new Error('exec failed')
        }
        d.stats.containerStats = async () => statsPayload({cpuTotal: 2e9, systemTotal: 200e9})
        await sampleInstances({...d, clock: () => t(120_000)})
        expect(inserted[1].gpuPct).toBeNull()
        expect(inserted[1].cpuPct).not.toBeNull()
    })

    it('isolates per-session failures and drops state for gone sessions', async () => {
        const t = ms => new Date(ms)
        const good = session({id: 'ok', instance: {id: 'i-ok', host: 'h'}})
        const bad = session({id: 'bad', instance: {id: 'i-bad', host: 'h'}})
        const {inserted, metricUpdates, deps: d} = deps({
            sessions: [good, bad],
            statsBySession: {
                ok: statsPayload({cpuTotal: 0, systemTotal: 0}),
                bad: new Error('connection refused'),
            },
        })
        await sampleInstances({...d, clock: () => t(0)})
        d.stats.containerStats = async ({id}) => {
            if (id === 'bad') throw new Error('connection refused')
            return statsPayload({cpuTotal: 1e9, systemTotal: 100e9})
        }
        await sampleInstances({...d, clock: () => t(60_000)})
        expect(inserted).toHaveLength(1)
        expect(inserted[0].sessionId).toBe('ok')

        // Session gone → its baseline is dropped and metrics updated without it.
        d.sessionRepo.sessions = async () => [good]
        await sampleInstances({...d, clock: () => t(120_000)})
        expect(d.samplerState.has('bad')).toBe(false)
        expect(metricUpdates.at(-1).every(({instanceId}) => instanceId === 'i-ok')).toBe(true)
    })
})

// ── the ratchets the tick applies (docs/session-expiration-model.md §3, §4b) ──────────────────
describe('the interaction signal from pty atime', () => {
    const t0 = new Date('2026-08-01T10:00:00Z')
    const t1 = new Date('2026-08-01T10:01:00Z')
    const t0s = Math.floor(t0.getTime() / 1000)
    const OLD_CTIME = t0s - 3600

    const twoTicks = async ({firstAtime, secondAtime}) => {
        const {extensions, deps: d} = deps({
            sessions: [session()],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0})},
            ptyText: ptyLine(firstAtime, OLD_CTIME),
        })
        await sampleInstances({...d, policy, clock: () => t0})
        d.stats.ptyStats = async () => ptyLine(secondAtime, OLD_CTIME)
        await sampleInstances({...d, policy, clock: () => t1})
        return extensions
    }

    // An ADVANCE since the previous tick, not "within a window of now": the window form silently
    // drops input landing near a tick boundary or during a slow sample.
    it('an advanced atime is an interaction', async () => {
        const extensions = await twoTicks({firstAtime: t0s - 300, secondAtime: t0s - 5})
        expect(extensions).toContainEqual(
            {sessionId: 's1', minutes: 16, interaction: true, reason: 'pty-input'})
    })

    // Program output advances mtime, never atime — a job printing a thousand log lines to an
    // abandoned terminal buys no time.
    it('a frozen atime is not', async () => {
        const extensions = await twoTicks({firstAtime: t0s - 300, secondAtime: t0s - 300})
        expect(extensions.filter(e => e.interaction)).toHaveLength(0)
    })

    // A broken exec means terminals have NO interaction signal — there is no browser-side backstop
    // for the web terminal, by design. The busy verdict still applies.
    it('a failing pty exec leaves the tick working', async () => {
        const {inserted, deps: d} = deps({
            sessions: [session()],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0})},
            ptyText: new Error('exec failed'),
        })
        await sampleInstances({...d, policy, clock: () => t0})
        d.stats.containerStats = async () => statsPayload({cpuTotal: 12e9, systemTotal: 120e9})
        await expect(sampleInstances({...d, policy, clock: () => t1})).resolves.toBeNull()
        expect(inserted).toHaveLength(1)
    })

    // A task-executor container has no user terminals; an exec per tick would be pure waste.
    it('only sandbox sessions are stat-ed', async () => {
        let execs = 0
        const {deps: d} = deps({
            sessions: [session({workerType: 'taskExecutor'})],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0})},
        })
        d.stats.ptyStats = async () => { execs++; return '' }
        await sampleInstances({...d, policy, clock: () => t0})
        expect(execs).toBe(0)
    })
})

describe('the busy ratchet', () => {
    const t0 = new Date('2026-08-01T10:00:00Z')
    const t1 = new Date('2026-08-01T10:01:00Z')

    const twoTicksWith = async windowStats => {
        const {extensions, deps: d} = deps({
            sessions: [session()],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0})},
            ptyText: '',
            windowStats,
        })
        await sampleInstances({...d, policy, clock: () => t0})
        d.stats.containerStats = async () => statsPayload({cpuTotal: 12e9, systemTotal: 120e9})
        await sampleInstances({...d, policy, clock: () => t1})
        return {extensions, d}
    }

    // Blind: the daemon is unreachable, which is the ONLY thing the coverage fail-safe answers to.
    const goBlind = d => {
        d.stats.containerStats = async () => { throw new Error('fetch failed') }
        d.usageRepo.busyWindowStats = async () => new Map()
    }

    const covered = overrides =>
        new Map([['s1', {samples: 10, cpuAvg: 0, gpuSamples: 10, gpuAvg: null, netAvg: 0, ...overrides}]])

    // The busy verdict is CLAMPED to the cap and does NOT stamp last_interaction_time — that is
    // the entire mechanism by which load alone cannot keep a session alive forever.
    it('extends with the cap applied and without re-anchoring it', async () => {
        const {extensions} = await twoTicksWith(covered({cpuAvg: 50}))
        expect(extensions).toContainEqual(
            {sessionId: 's1', minutes: 17, interaction: false, capHours: 12, reason: 'busy'})
    })

    it('a quiet session is not extended', async () => {
        const {extensions} = await twoTicksWith(covered())
        expect(extensions).toHaveLength(0)
    })

    // Regression, found in live simulation: a session whose stats call THREW was dropped from the
    // busy evaluation entirely, so the Docker-API blip the fail-safe exists for produced no
    // extension at all — the sampler logged three failures and let a computing instance expire on
    // schedule. The verdict is over stored samples, so a failed reading must not remove a session
    // from it.
    it('a session whose sampling fails still gets the coverage fail-safe', async () => {
        const t0 = new Date('2026-08-01T10:00:00Z')
        const t1 = new Date('2026-08-01T10:01:00Z')
        const {extensions, deps: d} = deps({
            sessions: [session()],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0})},
            ptyText: '',
            windowStats: new Map(),
        })
        await sampleInstances({...d, policy, clock: () => t0})
        d.stats.containerStats = async () => { throw new Error('fetch failed') }
        await sampleInstances({...d, policy, clock: () => t1})
        expect(extensions).toContainEqual(
            {sessionId: 's1', minutes: 17, interaction: false, capHours: 12, reason: 'coverage-grace'})
    })

    // A Docker-API blip must not close a computing instance, so missing coverage reads as busy —
    // but only for a bounded number of consecutive ticks, or a dead instance would never expire.
    // Regression: the coverage floor conflated "the sampler cannot see this instance" with "the
    // window has no history yet". A young session is not a blip — sampling is succeeding, there is
    // simply nothing to be busy about — and extending it overrode an explicit keep-alive within
    // seconds. Only blindness earns the grace.
    it('a thin window with HEALTHY sampling is not busy, and buys nothing', async () => {
        const t0 = new Date('2026-08-01T10:00:00Z')
        const t1 = new Date('2026-08-01T10:01:00Z')
        const {extensions, deps: d} = deps({
            sessions: [session()],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0})},
            ptyText: '',
            windowStats: new Map(),   // below the coverage floor, but nothing failed
        })
        await sampleInstances({...d, policy, clock: () => t0})
        await sampleInstances({...d, policy, clock: () => t1})
        expect(extensions).toEqual([])
    })

    // The reason distinguishes a real verdict from the fail-safe, which matters when reading logs:
    // 'coverage-grace' means the sampler could not see, not that the instance was working.
    it('the coverage fail-safe names itself in the ratchet', async () => {
        const {extensions, d} = await twoTicksWith(covered())
        goBlind(d)
        await sampleInstances({...d, policy, clock: () => new Date('2026-08-01T10:02:00Z')})
        expect(extensions[0].reason).toBe('coverage-grace')
    })

    // The count starts on tick ONE: a session is evaluated from the moment it exists, even though
    // its first tick only records a counter baseline and writes no sample. A brand-new session has
    // nothing in the window by construction, so it rides the grace — bounded, and shorter than any
    // sane startup lease.
    it('blindness is busy for the grace ticks, then stops', async () => {
        const {extensions, d} = await twoTicksWith(covered())
        expect(extensions).toHaveLength(0) // visible and quiet — nothing bought
        goBlind(d)
        await sampleInstances({...d, policy, clock: () => new Date('2026-08-01T10:02:00Z')})
        await sampleInstances({...d, policy, clock: () => new Date('2026-08-01T10:03:00Z')})
        expect(extensions).toHaveLength(2) // the two configured grace ticks
        await sampleInstances({...d, policy, clock: () => new Date('2026-08-01T10:04:00Z')})
        expect(extensions).toHaveLength(2) // grace exhausted; a dead instance still expires
    })

    // The same verdict that decides the ratchet is what the session report labels the instance
    // with, so a user reading "unused" in the Usage panel is reading the reason it will be closed.
    it('the verdict is recorded for the session report', async () => {
        const verdicts = createBusyRegistry()
        const {deps: d} = deps({
            sessions: [session()],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0})},
            ptyText: '',
            windowStats: covered({cpuAvg: 50}),
        })
        await sampleInstances({...d, policy, verdicts, clock: () => t0})
        expect(verdicts.get('s1')).toBe('busy')

        d.usageRepo.busyWindowStats = async () => covered()
        await sampleInstances({...d, policy, verdicts, clock: () => t1})
        expect(verdicts.get('s1')).toBe('unused')
    })

    // Missing coverage extends the session (the fail-safe) but says NOTHING about whether it is
    // being used, and a stale 'busy' would be a claim the sampler cannot support.
    it('missing coverage reads as unknown, not as the last verdict', async () => {
        const verdicts = createBusyRegistry()
        const {deps: d} = deps({
            sessions: [session()],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0})},
            ptyText: '',
            windowStats: covered({cpuAvg: 50}),
        })
        await sampleInstances({...d, policy, verdicts, clock: () => t0})
        d.usageRepo.busyWindowStats = async () => new Map()
        await sampleInstances({...d, policy, verdicts, clock: () => t1})
        expect(verdicts.get('s1')).toBe('unknown')
    })

    it('a session with no verdict at all reads as unknown', () => {
        expect(createBusyRegistry().get('never-sampled')).toBe('unknown')
    })

    it('drops the verdict of a session that is gone', async () => {
        const verdicts = createBusyRegistry()
        const {deps: d} = deps({
            sessions: [session()],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0})},
            ptyText: '',
            windowStats: covered({cpuAvg: 50}),
        })
        await sampleInstances({...d, policy, verdicts, clock: () => t0})
        d.sessionRepo.sessions = async () => []
        await sampleInstances({...d, policy, verdicts, clock: () => t1})
        expect(verdicts.get('s1')).toBe('unknown')
    })

    it('regaining sight resets the grace counter', async () => {
        const {extensions, d} = await twoTicksWith(covered())
        goBlind(d)
        await sampleInstances({...d, policy, clock: () => new Date('2026-08-01T10:02:00Z')})
        await sampleInstances({...d, policy, clock: () => new Date('2026-08-01T10:03:00Z')})
        expect(extensions).toHaveLength(2)

        // Sight returns, the window answers again — and the budget is refilled for the next blip.
        d.stats.containerStats = async () => statsPayload({cpuTotal: 12e9, systemTotal: 120e9})
        d.usageRepo.busyWindowStats = async () => covered()
        await sampleInstances({...d, policy, clock: () => new Date('2026-08-01T10:04:00Z')})
        goBlind(d)
        await sampleInstances({...d, policy, clock: () => new Date('2026-08-01T10:05:00Z')})
        await sampleInstances({...d, policy, clock: () => new Date('2026-08-01T10:06:00Z')})
        expect(extensions).toHaveLength(4)
    })
})

// Without a policy the tick is pure sampling — which is what keeps the phase-1 sampler and its
// admin reporting working unchanged.
describe('without an expiry policy', () => {
    it('samples but never ratchets', async () => {
        const t0 = new Date('2026-08-01T10:00:00Z')
        const t1 = new Date('2026-08-01T10:01:00Z')
        const {extensions, inserted, deps: d} = deps({
            sessions: [session()],
            statsBySession: {s1: statsPayload({cpuTotal: 0, systemTotal: 0})},
        })
        await sampleInstances({...d, clock: () => t0})
        d.stats.containerStats = async () => statsPayload({cpuTotal: 12e9, systemTotal: 120e9})
        await sampleInstances({...d, clock: () => t1})
        expect(inserted).toHaveLength(1)
        expect(extensions).toHaveLength(0)
    })
})
