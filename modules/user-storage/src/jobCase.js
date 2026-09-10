// planJobNormalization — decide how to restate queued jobs that name their user in a spelling the
// database no longer holds.
//
// A job id is `job-<username>-<action>`, so the same user can hold one job per spelling: a scheduled
// erase under one, a mark under another, neither aware of the other. The id is what makes a job
// unique to BullMQ, and it cannot be edited in place — the job is added again under the stored name
// and the old one dropped, which is why this returns work rather than doing it.
//
// The key planner does the deciding: an id is a prefixed name like any other, and lowercasing the
// whole `<username>-<action>` suffix is safe because the actions are lowercase already.
//
// Each re-add carries the job it replaces, so the executor can drop the original only once its
// replacement exists. A re-added job keeps its options but not its original delay, which was measured
// from the moment it was first scheduled: what has to survive is the instant it comes due, so the
// delay is recomputed from the time remaining. An overdue job is added with no delay and runs at
// once, as it would have.

import {planKeyNormalization} from '#sepal/redisKeyCase'
import {storedUsername} from '#sepal/username'

const JOB_PREFIX = 'job'

const remainingDelay = (job, now) =>
    Math.max(0, (job.opts?.delay ?? 0) + job.timestamp - now)

const planJobNormalization = (jobs, {now = Date.now()} = {}) => {
    const byId = new Map(jobs.map(job => [job.id, job]))
    const {remove, rename} = planKeyNormalization([...byId.keys()], {prefix: JOB_PREFIX, separator: '-'})

    return {
        remove: remove.map(id => byId.get(id)),
        readd: rename.map(({from, to}) => {
            const job = byId.get(from)
            return {
                job,
                name: job.name,
                data: {...job.data, username: storedUsername(job.data.username)},
                opts: {...job.opts, jobId: to, delay: remainingDelay(job, now)}
            }
        })
    }
}

export {planJobNormalization}
