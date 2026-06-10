import {createRequire} from 'module'

import * as config from '#gee/config'
import ee from '#sepal/ee/ee'
import Job from '#sepal/worker/job'

// authenticate <-> job form a cycle; load it lazily (at job() call time) to break it.
const require = createRequire(import.meta.url)

const getSepalUser = ctx => {
    const sepalUser = ctx.request.headers['sepal-user']
    return sepalUser
        ? JSON.parse(sepalUser)
        : {}
}

const getCredentials = ctx => {
    const sepalUser = getSepalUser(ctx)
    const serviceAccountCredentials = config.serviceAccountCredentials
    return {
        sepalUser,
        serviceAccountCredentials,
        googleProjectId: config.googleProjectId
    }
}

const job = ({
    jobName,
    jobPath,
    initArgs,
    maxConcurrency,
    minIdleCount,
    maxIdleMilliseconds,
    ctx,
    before = [require('#gee/jobs/ee/authenticate').default],
    services,
    args = ctx => ({
        requestArgs: {...ctx.request.query, ...ctx.request.body},
        credentials: getCredentials(ctx)
    }),
    worker$,
    finalize$
}) => {
    const workerWithWorkloadTag$ = (...args) => {
        const tag = `sepal-work-${jobName
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .substring(0, 63)}`
        ee.data.setDefaultWorkloadTag(tag)
        return worker$(...args)
    }
    return Job({
        jobName,
        jobPath,
        schedulerName: 'GoogleEarthEngine',
        initArgs,
        maxConcurrency,
        minIdleCount,
        maxIdleMilliseconds,
        ctx,
        before,
        services,
        args,
        worker$: workerWithWorkloadTag$,
        finalize$
    })
}

export {job}
