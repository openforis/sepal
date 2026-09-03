// Cross-sweep memory for CloseSessionsWithoutInstance, turning a single probe result into a
// decision about whether the session's instance is really gone.
//
// The rule, per session:
//   PROVISIONED — the instance answered; forget everything recorded about it.
//   MISSING     — Docker denied the containers; close once that has happened
//                 `missesBeforeClose` times without a PROVISIONED in between. An intervening
//                 UNKNOWN does NOT reset the count: an inconclusive probe is not evidence of life.
//   UNKNOWN     — never closes on its own, no matter how often it repeats. It only starts a clock:
//                 once a session has gone `unknownBackstopMs` without a single conclusive probe,
//                 it is closed anyway, so an unreachable host cannot bill forever.
//
// State is in-memory and per-process. Losing it on restart is the safe direction — every session
// starts from a clean slate and must earn its close again.

import {InstanceStatus} from '../workerInstance/instanceStatus.js'

const createMissingInstanceTracker = ({
    missesBeforeClose = 2,
    unknownBackstopMs = 30 * 60_000,
    clock = () => new Date(),
} = {}) => {
    // sessionId → {misses, unknownSince}
    const bySession = new Map()

    const entryFor = sessionId => {
        let entry = bySession.get(sessionId)
        if (!entry) {
            entry = {misses: 0, unknownSince: null}
            bySession.set(sessionId, entry)
        }
        return entry
    }

    // record — feed one probe result; true means "close this session now".
    const record = (sessionId, status) => {
        if (status === InstanceStatus.PROVISIONED) {
            bySession.delete(sessionId)
            return false
        }
        const entry = entryFor(sessionId)
        if (status === InstanceStatus.MISSING) {
            entry.misses++
            return entry.misses >= missesBeforeClose
        }
        entry.unknownSince = entry.unknownSince ?? clock()
        return clock().getTime() - entry.unknownSince.getTime() >= unknownBackstopMs
    }

    // retain — drop everything not in the current sweep (closed sessions, sessions that lost
    // their instance row) so the map cannot grow without bound.
    const retain = sessionIds => {
        const live = new Set(sessionIds)
        for (const sessionId of [...bySession.keys()]) {
            if (!live.has(sessionId)) {
                bySession.delete(sessionId)
            }
        }
    }

    return {record, retain}
}

export {createMissingInstanceTracker}
