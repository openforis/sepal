// Resolve case collisions in a BullMQ queue via the API (never DEL the job hash:
// that would leave dangling ids in delayed/wait/prioritized/completed/failed).
// Duplicate (lowercase twin exists) -> remove the mixed-case job.
// Mixed-case only                   -> re-add under the lowercase id, same data/delay, then remove.
import {Queue} from 'bullmq'
import {Redis} from 'ioredis'

const [host, db, queueName] = [process.env.REDIS_HOST, Number(process.env.REDIS_DB), process.env.QUEUE]
const apply = process.argv.includes('--apply')

const connection = new Redis({host, db, maxRetriesPerRequest: null})
const queue = new Queue(queueName, {connection})

const jobs = await queue.getJobs(['delayed', 'waiting', 'prioritized', 'paused'])
const byLower = new Map()
for (const job of jobs) {
    const key = job.id.toLowerCase()
    byLower.set(key, [...(byLower.get(key) ?? []), job])
}

let removed = 0, renamed = 0
for (const [lower, group] of byLower) {
    const mixed = group.filter(job => job.id !== job.id.toLowerCase())
    if (!mixed.length) continue
    const hasLowerTwin = group.some(job => job.id === lower)

    for (const job of mixed) {
        if (hasLowerTwin) {
            console.log(`remove duplicate ${job.id} (keeping ${lower})`)
            if (apply) await queue.remove(job.id)
            removed++
        } else {
            const delay = Math.max(0, (job.opts.delay ?? 0) + job.timestamp - Date.now())
            const data = {...job.data, username: job.data.username?.toLowerCase()}
            console.log(`rename ${job.id} -> ${lower} (delay ${Math.round(delay / 86400e3)}d)`)
            if (apply) {
                await queue.add(job.name, data, {...job.opts, jobId: lower, delay})
                await queue.remove(job.id)
            }
            renamed++
        }
    }
}

console.log(`\nduplicates removed: ${removed}, renamed to lowercase: ${renamed}`)
apply || console.log('DRY RUN — pass --apply to write')
await queue.close()
await connection.quit()
