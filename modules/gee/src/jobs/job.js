import {createRequire} from 'node:module'

import {defer} from 'rxjs'

import * as config from '#gee/config'
import {createEEContext} from '#gee/jobs/eeRequestContext'
import {inEEContext} from '#sepal/ee/eeContext'
import {inRecipeScope} from '#sepal/ee/recipeScope'
import Job from '#sepal/worker/job'

// runtime <-> job form a cycle; load it lazily (at job() call time) to break it.
const require = createRequire(import.meta.url)

const parseHeader = (ctx, name) => {
    const value = ctx.request.headers[name]
    return value
        ? JSON.parse(value)
        : null
}

const getCredentials = ctx => ({
    sepalUser: parseHeader(ctx, 'sepal-user') || {},
    sepalSession: parseHeader(ctx, 'sepal-session'),
    serviceAccountCredentials: config.serviceAccountCredentials,
    googleProjectId: config.googleProjectId
})

const job = ({
    jobName,
    jobPath,
    initArgs,
    maxConcurrency,
    minIdleCount,
    maxIdleMilliseconds,
    ctx,
    before = [require('#gee/jobs/ee/runtime').default],
    services,
    args = ctx => ({
        requestArgs: {...ctx.request.query, ...ctx.request.body},
        credentials: getCredentials(ctx)
    }),
    worker$,
    finalize$,
    workloadTag
}) => {
    // Every task of a request makes its Earth Engine calls as the request's user, and runs inside the request's
    // own recipe operation, which the configure task ahead of them put on the shared state.
    const workerInContext$ = (...args) => {
        const [{credentials, requestArgs, initArgs: {eeEndpoint} = {}, requestId, state} = {}] = args
        return defer(() => inEEContext(
            createEEContext({requestId, credentials, jobName, workloadTag: workloadTag?.(requestArgs), endpoint: eeEndpoint}),
            defer(() => inRecipeScope(state?.recipeScope, worker$(...args)))
        ))
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
        worker$: workerInContext$,
        finalize$
    })
}

export {job}
