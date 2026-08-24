// sampleInstances — one sampler tick.
//
// For every ACTIVE session: read container stats (CPU/RAM/network) and, on GPU instance
// types, exec nvidia-smi. CPU/network are interval averages computed against the previous
// tick's counters (samplerState); the first tick per session only records the baseline.
// Per-session try/catch isolation (closeTimedOutSessions style): a broken instance must
// not stop sampling of the others, and sampling errors never affect session health.
//
// The tick also EXTENDS deadlines (docs/session-expiration-model.md §3/§4b), which is why the
// sampler must stay always-on and independent of any policy flag:
//   - pty atime advanced since the last tick → a human typed in a terminal: an INTERACTION
//     extension, which re-anchors the unattended cap;
//   - the busy verdict holds over the window → a BUSY extension, which does not re-anchor the cap
//     and is clamped to it, so load alone can never keep a session alive past maxUnattendedHours.
// Sampling and ratcheting share the tick rather than running as two jobs so the verdict sees the
// sample it just wrote.

import {getLogger} from '#sepal/log'

import {sessionTag} from '../tag.js'
import {SANDBOX} from '../workerInstance/workerTypes.js'
import {State} from '../workerSession/workerSession.js'
import {Verdict} from './busyRegistry.js'
import {isBusy, requiredSamplesFor} from './busyVerdict.js'
import {computeCpuPct, computeNetRates, computeRamUsage, countUserTerminals, extractCounters, parseGpuCsv, parsePtyStat} from './computeUsage.js'

const log = getLogger('worker/sampleInstances')

// The lifecycle narrative shares ONE category with the ratchet in workerSessionRepository, so a
// single switch shows the whole chain: signal observed → ratchet applied → resulting deadline.
// Sampling failures stay on the sampler's own category above — a broken exec is an operational
// problem, not part of the expiry story.
const expiryLog = getLogger('worker/expiry')

const MINUTE_MS = 60_000

const sampleGpu = async (stats, session) => {
    try {
        return parseGpuCsv(await stats.gpuStats(session))
    } catch (error) {
        log.warn(`GPU sampling failed for ${sessionTag(session)}: ${error.message}`)
        return null
    }
}

// samplePtys — the terminal signals, both read from ONE `stat` of the container's ptys:
//   atime     — the most recent input, which drives the interaction ratchet;
//   terminals — how many ptys have ever had input, i.e. live terminal sessions, which is what the
//               expiry notification tells the user is running.
//
// A failure means terminals have NO interaction signal for this session this tick (there is no
// browser-side backstop for the web terminal, by design: a broken exec fails SSH users too, and a
// browser path would have patched a third of the problem while making the design look complete).
// The CPU/network busy verdict still applies.
const samplePtys = async (stats, session, {now, tickSeconds}) => {
    if (!stats.ptyStats) {
        return null
    }
    try {
        const text = await stats.ptyStats(session)
        return {atime: parsePtyStat(text, {now, tickSeconds}), terminals: countUserTerminals(text)}
    } catch (error) {
        log.warn(`PTY sampling failed for ${sessionTag(session)}: ${error.message}`)
        return null
    }
}

// extendBusySessions — one window query for every session evaluated this tick, then a clamped busy
// ratchet per verdict.
//
// Coverage below the floor means only "no verdict from this window". WHY there is no verdict
// decides what to do, and the two reasons are not alike:
//
//   the sampler could not reach the instance — we are BLIND. Under the old idle FSM missing data
//     spared a session; under a deadline it would kill one, and a Docker-API blip must not close a
//     computing instance. So the session is treated as busy for up to unknownBusyGraceTicks
//     consecutive ticks, then stops being extended, so a genuinely dead instance still expires
//     (and CloseSessionsWithoutInstance reaches it first in most cases).
//
//   the window simply has no history yet — a young session. Nothing is blind here: sampling is
//     working and the instance is plainly idle, there is just not ten minutes of it. Extending on
//     that is claiming evidence we never had, and it overrode an explicitly set keep-alive within
//     seconds of the user setting it. Not busy, no extension; the lease or the user's keep-alive
//     governs, which is what they are for.
const extendBusySessions = async ({sessions, sessionRepo, usageRepo, instanceTypeById, policy, samplerState, verdicts, now}) => {
    const sessionIds = sessions.map(({id}) => id)
    if (!sessionIds.length) {
        return
    }
    const windowStart = new Date(now.getTime() - policy.busyWindowMinutes * MINUTE_MS)
    const requiredSamples = requiredSamplesFor(policy.busyWindowMinutes, policy.samplingIntervalSeconds)
    const stats = await usageRepo.busyWindowStats(sessionIds, windowStart)
    for (const session of sessions) {
        try {
            const state = samplerState.get(session.id)
            const {busy, coverage} = isBusy({
                stats: stats.get(session.id),
                instanceType: instanceTypeById[session.instanceType],
                policy,
                requiredSamples,
            })
            let extend = busy
            // Reported as the session's verdict. Without coverage it is 'unknown' rather than the
            // previous verdict: the fail-safe below still extends, but nothing was observed.
            verdicts?.set(session.id, coverage
                ? busy ? Verdict.BUSY : Verdict.UNUSED
                : Verdict.UNKNOWN)
            if (coverage || !state?.samplingFailed) {
                // Either the window answered, or it did not but the instance is perfectly visible —
                // a young session with no history yet. Neither of those is blindness, so neither
                // earns the fail-safe.
                if (state) {
                    state.unknownBusyTicks = 0
                }
            } else {
                const ticks = (state?.unknownBusyTicks ?? 0) + 1
                if (state) {
                    state.unknownBusyTicks = ticks
                }
                extend = ticks <= policy.unknownBusyGraceTicks
                if (extend) {
                    expiryLog.debug(() => `${sessionTag(session)} unreachable and below the coverage`
                        + ` floor (tick ${ticks} of ${policy.unknownBusyGraceTicks}) - treated as busy`)
                } else {
                    expiryLog.debug(() => `${sessionTag(session)} unreachable and below the coverage`
                        + ` floor past ${policy.unknownBusyGraceTicks} ticks - no longer extended`)
                }
            }
            if (extend) {
                if (busy) {
                    const windowStats = stats.get(session.id)
                    expiryLog.debug(() => `${sessionTag(session)} BUSY over ${policy.busyWindowMinutes}m`
                        + ` (${windowStats?.samples} samples,`
                        + ` cpu ${windowStats?.cpuAvg}% of ${instanceTypeById[session.instanceType]?.cpuCount} cores,`
                        + ` gpu ${windowStats?.gpuAvg ?? '-'}%,`
                        + ` net ${windowStats?.netAvg == null ? '-' : Math.round(windowStats.netAvg / 1024)} KB/s)`)
                }
                await sessionRepo.extendSession({
                    sessionId: session.id,
                    minutes: policy.busyExtensionMinutes,
                    interaction: false,
                    capHours: policy.maxUnattendedHours,
                    reason: busy ? 'busy' : 'coverage-grace',
                })
            }
        } catch (error) {
            log.warn(`Busy evaluation failed for ${sessionTag(session)}: ${error.message}`)
        }
    }
}

const sampleInstances = async ({sessionRepo, usageRepo, stats, instanceTypeById, usageMetrics, samplerState, terminals = null, verdicts = null, policy = null, clock = () => new Date()}) => {
    const sessions = await sessionRepo.sessions([State.ACTIVE])
    const samples = []
    // Every session of a known instance type is evaluated for busyness, INCLUDING one whose
    // sampling just failed. The verdict is computed over a window of STORED samples, not over this
    // tick's reading, and a session dropped here would get no verdict and no coverage fail-safe
    // either — which is exactly the Docker-API blip the fail-safe exists for. Measured in live
    // simulation: with the daemon unreachable the sampler logged three failures and extended
    // nothing at all, leaving a computing instance to expire on schedule.
    const evaluated = []
    for (const session of sessions) {
        try {
            const instanceType = instanceTypeById[session.instanceType]
            if (!instanceType) {
                log.warn(`Unknown instance type ${session.instanceType} for ${sessionTag(session)} - skipping`)
                continue
            }
            evaluated.push(session)
            // Cleared only once the read succeeds, so the flag says "we could not see this
            // instance on the most recent tick" — which is what the coverage fail-safe keys on.
            const raw = await stats.containerStats(session)
            const counters = extractCounters(raw)
            const now = clock()
            const prev = samplerState.get(session.id)
            const ptys = policy && session.workerType === SANDBOX
                ? await samplePtys(stats, session, {now, tickSeconds: policy.samplingIntervalSeconds})
                : null
            const ptyAtime = ptys?.atime ?? null
            if (ptys && terminals) {
                terminals.set(session.id, ptys.terminals)
            }
            samplerState.set(session.id, {
                time: now,
                counters,
                ptyAtime: ptyAtime ?? prev?.ptyAtime ?? null,
                unknownBusyTicks: prev?.unknownBusyTicks ?? 0,
                interactionSeen: prev?.interactionSeen ?? false,
                samplingFailed: false,
            })
            if (!prev) {
                // First tick for this session: no counter baseline → no sample (by design).
                continue
            }
            // An ADVANCE since the previous tick, not "within a window of now": the window form
            // silently drops input landing near a tick boundary or during a slow sample.
            if (policy && ptyAtime !== null && prev.ptyAtime !== null && ptyAtime > prev.ptyAtime) {
                const state = samplerState.get(session.id)
                // The FIRST advance is info: it is the evidence that the terminal signal works at
                // all on this image and provider, which is the one thing rollout step 2 cannot
                // reason its way to. Subsequent advances are routine and stay at debug.
                const message = `${sessionTag(session)} terminal input detected`
                    + ` (pty atime ${prev.ptyAtime} -> ${ptyAtime})`
                if (state.interactionSeen) {
                    expiryLog.debug(message)
                } else {
                    state.interactionSeen = true
                    expiryLog.info(`${message} - first for this session`)
                }
                await sessionRepo.extendSession({
                    sessionId: session.id,
                    minutes: policy.interactionExtensionMinutes,
                    interaction: true,
                    reason: 'pty-input',
                })
            }
            const elapsedSeconds = (now.getTime() - prev.time.getTime()) / 1000
            const gpu = instanceType.gpuCount > 0 ? await sampleGpu(stats, session) : null
            const sample = {
                sessionId: session.id,
                username: session.username,
                instanceType: session.instanceType,
                sampleTime: now,
                cpuPct: computeCpuPct(prev.counters, counters, instanceType.cpuCount),
                ...computeRamUsage(raw, instanceType.ramBytes),
                gpuPct: gpu?.gpuPct ?? null,
                gpuRamBytes: gpu?.gpuRamBytes ?? null,
                ...computeNetRates(prev.counters, counters, elapsedSeconds),
            }
            await usageRepo.insertSample(sample)
            samples.push({...sample, instanceId: session.instance.id})
        } catch (error) {
            // Mark the session BLIND for this tick. Only this — an unreachable instance — earns the
            // coverage fail-safe; a merely thin window does not.
            const prev = samplerState.get(session.id)
            samplerState.set(session.id, {...(prev ?? {}), samplingFailed: true})
            log.warn(`Usage sampling failed for ${sessionTag(session)}: ${error.message}`)
        }
    }
    if (policy) {
        await extendBusySessions({
            sessions: evaluated, sessionRepo, usageRepo, instanceTypeById, policy, samplerState,
            verdicts, now: clock(),
        })
    }
    // Drop baselines of sessions that are no longer active (closed or timed out).
    const liveIds = new Set(sessions.map(({id}) => id))
    for (const sessionId of samplerState.keys()) {
        if (!liveIds.has(sessionId)) {
            samplerState.delete(sessionId)
        }
    }
    for (const sessionId of terminals?.sessionIds() ?? []) {
        if (!liveIds.has(sessionId)) {
            terminals.forget(sessionId)
        }
    }
    for (const sessionId of verdicts?.sessionIds() ?? []) {
        if (!liveIds.has(sessionId)) {
            verdicts.forget(sessionId)
        }
    }
    usageMetrics.update(samples)
    return null
}

export {sampleInstances}
