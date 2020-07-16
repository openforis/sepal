const Job = require('sepal/worker/job')
const logConfig = require('root/log.json')

module.exports = {
    job: ({
              jobName,
              jobPath,
              initArgs,
              maxConcurrency,
              minIdleCount,
              maxIdleMilliseconds,
              ctx,
              before = [require('root/jobs/ee/initialize')],
              services = [],
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
