// SessionUsageHistory — one session's resource usage since it was created, for the chart in the
// session list. Long sessions are averaged into wider buckets, so the chart gets at most
// MAX_POINTS points however long the session has run; a bucket is never narrower than a minute,
// the sampling interval.
//
// A session another user owns answers as if it did not exist: a user must not be able to probe
// for session ids. `username` null is the admin case and skips the check.

import {NotFoundException} from '#sepal/exception'

const MAX_POINTS = 240
const MIN_BUCKET_SECONDS = 60

const sessionUsageHistory = async ({sessionId, username}, {repo, usageRepo, clock}) => {
    const session = await repo.getSession(sessionId).catch(() => null)
    if (!session || (username && username !== session.username)) {
        throw new NotFoundException(`Non-existing session: ${sessionId}`)
    }
    const fromTime = new Date(session.creationTime)
    const samples = await usageRepo.sessionHistory(sessionId, {
        fromTime,
        bucketSeconds: bucketSeconds(fromTime, clock())
    })
    return {samples}
}

const bucketSeconds = (fromTime, now) => {
    const minutes = Math.ceil((now.getTime() - fromTime.getTime()) / 1000 / MAX_POINTS / 60)
    return Math.max(MIN_BUCKET_SECONDS, minutes * 60)
}

export {sessionUsageHistory}
