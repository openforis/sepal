const Job = require('sepal/worker/job')
const logConfig = require('gee/log.json')

module.exports = {
    job: ({
        jobName,
        jobPath,
        initArgs,
        maxConcurrency,
        minIdleCount,
        maxIdleMilliseconds,
        ctx,
        before = [require('gee/jobs/ee/initialize')],
        services,
        args = ctx => [ctx.request.body],
        worker$,
    }) =>
        Job(logConfig)({
            jobName,
            jobPath,
            initArgs,
            maxConcurrency,
            minIdleCount,
            maxIdleMilliseconds,
            ctx,
            before,
            services,
            args,
            worker$,
        })
}
