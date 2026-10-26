import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {firstValueFrom, timeout} from 'rxjs'

import threadJob from '#sepal/testSupport/worker/threadJob'

import {initScheduler} from './scheduler.js'
import {ROUND_ROBIN} from './staticPool.js'

const INSTANCES = 2

initScheduler({name: 'SchedulerTest', strategy: ROUND_ROBIN, instances: INSTANCES})

describe('a scheduler', () => {
    test('fails the job running on a worker thread that crashes', async () => {
        await assert.rejects(runJob({crash: true}), /exited with code 1/)
    })

    test('replaces a worker thread that crashed', async () => {
        await assert.rejects(runJob({crash: true}), /exited with code 1/)

        await eventually(async () => {
            for (let i = 0; i < INSTANCES; i++) {
                assert.equal(await runJob({}), 'done')
            }
        })
    })
})

let requestCount = 0

function runJob(params) {
    const requestId = `request-${++requestCount}`
    return firstValueFrom(
        threadJob({username: 'alice', requestId, requestTag: requestId, ...params}).pipe(
            timeout(5000)
        )
    )
}

async function eventually(assertion, deadlineMs = 10000) {
    const deadline = Date.now() + deadlineMs
    for (;;) {
        try {
            return await assertion()
        } catch (error) {
            if (Date.now() > deadline) {
                throw error
            }
            await new Promise(resolve => setTimeout(resolve, 100))
        }
    }
}
