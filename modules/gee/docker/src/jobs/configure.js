const {job} = require('root/jobs/job')

const worker$ = () => {
    const {configure} = require('sepal/context')
    const {getContext$} = require('root/jobs/service/context')
    const {tap} = require('rx/operators')
    return getContext$().pipe(
        tap(context => configure(context))
    )
}

module.exports = job({
    jobName: 'Configure',
    before: [],
    services: [require('root/jobs/service/context').contextService],
    worker$
})
