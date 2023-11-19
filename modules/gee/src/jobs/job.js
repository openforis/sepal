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
        serviceAccountCredentials
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
        args = ctx => [{...ctx.request.query, ...ctx.request.body}, getCredentials(ctx)],
        worker$
    }) =>
        Job()({
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
            worker$
        })
}
