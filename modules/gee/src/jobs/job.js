const Job = require('#sepal/worker/job')

const getSepalUser = ctx => {
    const sepalUser = ctx.request.headers['sepal-user']
    return sepalUser
        ? JSON.parse(sepalUser)
        : {}
}

const getCredentials = ctx => {
    const config = require('#gee/config')
    const sepalUser = getSepalUser(ctx)
    const serviceAccountCredentials = config.serviceAccountCredentials
    return {
        sepalUser,
        serviceAccountCredentials,
        googleProjectId: config.googleProjectId
    }
}

module.exports = {
    job: ({
        jobName,
        jobPath,
        initArgs,
        maxConcurrency,
        minIdleCount,
        maxIdleMilliseconds,
        ctx,
        before = [require('#gee/jobs/ee/authenticate')],
        services,
        args = ctx => ({
            requestArgs: {...ctx.request.query, ...ctx.request.body},
            credentials: getCredentials(ctx)
        }),
        worker$
    }) => {
        const workerWithWorkloadTag$ = (...args) => {
            const ee = require('#sepal/ee/ee')
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
            worker$: workerWithWorkloadTag$
        })
    }
}
