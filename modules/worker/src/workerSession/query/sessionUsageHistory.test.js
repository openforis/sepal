import assert from 'node:assert/strict'
import {test} from 'node:test'

import {sessionUsageHistory} from './sessionUsageHistory.js'

test('returns the session\'s samples since it was created', async () => {
    const {deps, historyCalls} = given({session: aSession()})

    const history = await sessionUsageHistory({sessionId: SESSION_ID, username: OWNER}, deps)

    assert.deepEqual(history, {samples: SAMPLES})
    assert.deepEqual(historyCalls[0][1].fromTime, CREATION_TIME)
})

test('a young session is read at the sampling interval', async () => {
    const {deps, historyCalls} = given({session: aSession(), now: hoursAfterCreation(1)})

    await sessionUsageHistory({sessionId: SESSION_ID, username: OWNER}, deps)

    assert.equal(historyCalls[0][1].bucketSeconds, 60)
})

test('a long session is averaged into wider whole-minute buckets, at most 240 of them', async () => {
    const {deps, historyCalls} = given({session: aSession(), now: hoursAfterCreation(10)})

    await sessionUsageHistory({sessionId: SESSION_ID, username: OWNER}, deps)

    assert.equal(historyCalls[0][1].bucketSeconds, 180)
})

test('an admin reads any user\'s session', async () => {
    const {deps} = given({session: aSession()})

    const history = await sessionUsageHistory({sessionId: SESSION_ID, username: null}, deps)

    assert.deepEqual(history, {samples: SAMPLES})
})

test('another user\'s session is not found', async () => {
    const {deps, historyCalls} = given({session: aSession()})

    await assert.rejects(
        sessionUsageHistory({sessionId: SESSION_ID, username: 'bob'}, deps),
        {statusCode: 404}
    )
    assert.equal(historyCalls.length, 0)
})

test('a non-existing session is not found', async () => {
    const {deps} = given({session: null})

    await assert.rejects(
        sessionUsageHistory({sessionId: SESSION_ID, username: OWNER}, deps),
        {statusCode: 404}
    )
})

const given = ({session, now = hoursAfterCreation(1)}) => {
    const historyCalls = []
    return {
        historyCalls,
        deps: {
            repo: {getSession: async () => {
                if (!session) {
                    throw new Error('Non-existing worker session')
                }
                return session
            }},
            usageRepo: {sessionHistory: async (...args) => {
                historyCalls.push(args)
                return SAMPLES
            }},
            clock: () => now
        }
    }
}

const aSession = () => ({id: SESSION_ID, username: OWNER, creationTime: CREATION_TIME})

const hoursAfterCreation = hours => new Date(CREATION_TIME.getTime() + hours * 3600_000)

const SESSION_ID = 's1'
const OWNER = 'alice'
const CREATION_TIME = new Date('2026-08-01T08:00:00Z')
const SAMPLES = [{sampleTime: new Date('2026-08-01T08:01:00Z'), cpuPct: 12, ramPct: 30, gpuPct: null, netBytesPerS: 300}]
