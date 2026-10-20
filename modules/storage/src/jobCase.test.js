import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {planJobNormalization} from './jobCase.js'

const job = ({id, username, action = 'mark', timestamp = 1000, delay = 500, ...opts}) => ({
    id,
    name: 'rescan',
    timestamp,
    data: {username, action},
    opts: {jobId: id, delay, attempts: 100, priority: 1, ...opts}
})

describe('planJobNormalization', () => {
    it('leaves jobs already named by the stored username alone', () => {
        const jobs = [job({id: 'job-alice-mark', username: 'alice'})]
        assert.deepEqual(planJobNormalization(jobs), {remove: [], readd: []})
    })

    it('removes a job duplicating one already named by the stored username', () => {
        const duplicate = job({id: 'job-Alice-mark', username: 'Alice'})
        const jobs = [duplicate, job({id: 'job-alice-mark', username: 'alice'})]

        assert.deepEqual(planJobNormalization(jobs), {remove: [duplicate], readd: []})
    })

    it('re-adds a job with no stored-username counterpart under the stored name', () => {
        const orphan = job({id: 'job-Alice-mark', username: 'Alice', timestamp: 1000, delay: 500})

        assert.deepEqual(planJobNormalization([orphan], {now: 1200}), {
            remove: [],
            readd: [{
                job: orphan,
                name: 'rescan',
                data: {username: 'alice', action: 'mark'},
                opts: {jobId: 'job-alice-mark', delay: 300, attempts: 100, priority: 1}
            }]
        })
    })

    it('pairs each re-add with the job it replaces, so the original outlives a failed add', () => {
        const orphan = job({id: 'job-Alice-mark', username: 'Alice'})
        const {remove, readd} = planJobNormalization([orphan], {now: 1000})

        assert.deepEqual(remove, [])
        assert.equal(readd[0].job, orphan)
    })

    it('schedules an overdue job to run at once', () => {
        const orphan = job({id: 'job-Alice-mark', username: 'Alice', timestamp: 1000, delay: 500})
        const [{opts}] = planJobNormalization([orphan], {now: 99999}).readd

        assert.equal(opts.delay, 0)
    })

    it('preserves the remaining options of a re-added job', () => {
        const orphan = job({
            id: 'job-Alice-erase',
            username: 'Alice',
            action: 'erase',
            backoff: {type: 'exponential', delay: 60000},
            removeOnFail: 100
        })
        const [{data, opts}] = planJobNormalization([orphan], {now: 1000}).readd

        assert.deepEqual(data, {username: 'alice', action: 'erase'})
        const {jobId, backoff, removeOnFail, attempts, priority} = opts
        assert.deepEqual({jobId, backoff, removeOnFail, attempts, priority}, {
            jobId: 'job-alice-erase',
            backoff: {type: 'exponential', delay: 60000},
            removeOnFail: 100,
            attempts: 100,
            priority: 1
        })
    })

    it('re-adds one job and removes the rest when several spellings collide', () => {
        const first = job({id: 'job-ALICE-mark', username: 'ALICE'})
        const second = job({id: 'job-Alice-mark', username: 'Alice'})
        const {remove, readd} = planJobNormalization([first, second], {now: 1000})

        assert.equal(readd.length, 1)
        assert.equal(readd[0].opts.jobId, 'job-alice-mark')
        assert.equal(readd[0].job, second)
        assert.deepEqual(remove, [first])
    })
})
