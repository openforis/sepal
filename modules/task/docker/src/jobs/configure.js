const {job} = require('root/jobs/job')

const worker$ = () => {
    const {configure} = require('sepal/context')
    const {getCurrentContext$} = require('root/jobs/service/context')
    const {tap} = require('rx/operators')
    const {swallow} = require('sepal/rxjs/operators')
    return getCurrentContext$().pipe(
        tap(context => configure(context.getConfig())),
        swallow()
    )
}

module.exports = job({
    jobName: 'Configure',
    services: [require('root/jobs/service/context').contextService],
    worker$
})
