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
        expect(planJobNormalization(jobs)).toEqual({remove: [], readd: []})
    })

    it('removes a job duplicating one already named by the stored username', () => {
        const duplicate = job({id: 'job-Alice-mark', username: 'Alice'})
        const jobs = [duplicate, job({id: 'job-alice-mark', username: 'alice'})]

        expect(planJobNormalization(jobs)).toEqual({remove: [duplicate], readd: []})
    })

    it('re-adds a job with no stored-username counterpart under the stored name', () => {
        const orphan = job({id: 'job-Alice-mark', username: 'Alice', timestamp: 1000, delay: 500})

        expect(planJobNormalization([orphan], {now: 1200})).toEqual({
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

        expect(remove).toEqual([])
        expect(readd[0].job).toBe(orphan)
    })

    it('schedules an overdue job to run at once', () => {
        const orphan = job({id: 'job-Alice-mark', username: 'Alice', timestamp: 1000, delay: 500})
        const [{opts}] = planJobNormalization([orphan], {now: 99999}).readd

        expect(opts.delay).toBe(0)
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

        expect(data).toEqual({username: 'alice', action: 'erase'})
        expect(opts).toEqual(expect.objectContaining({
            jobId: 'job-alice-erase',
            backoff: {type: 'exponential', delay: 60000},
            removeOnFail: 100,
            attempts: 100,
            priority: 1
        }))
    })

    it('re-adds one job and removes the rest when several spellings collide', () => {
        const first = job({id: 'job-ALICE-mark', username: 'ALICE'})
        const second = job({id: 'job-Alice-mark', username: 'Alice'})
        const {remove, readd} = planJobNormalization([first, second], {now: 1000})

        expect(readd).toHaveLength(1)
        expect(readd[0].opts.jobId).toBe('job-alice-mark')
        expect(readd[0].job).toBe(second)
        expect(remove).toEqual([first])
    })
})
