const {job} = require('root/jobs/job')

const worker$ = () => {
    const {configure} = require('sepal/context')
    const {getContext$} = require('root/jobs/service/context')
    const {tap} = require('rx/operators')
    const log = require('sepal/log').getLogger('task')
    return getContext$().pipe(
        tap(context => {
            log.warn('task context', context)
            return configure(context.getConfig());
        })
    )
}

module.exports = job({
    jobName: 'Configure',
    services: [require('root/jobs/service/context').contextService],
    worker$
})
