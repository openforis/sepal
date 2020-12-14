const {job} = require('root/jobs/job')

const worker$ = () => {
    const {configure} = require('sepal/context')
    const {getContext$} = require('root/jobs/service/context')
    const {tap} = require('rx/operators')
    const {swallow} = require('sepal/rxjs/operators')
    return getContext$().pipe(
        tap(context => configure(context)),
        swallow()
    )
}

module.exports = job({
    jobName: 'Configure shared library',
    before: [],
    services: [require('root/jobs/service/context').contextService],
    worker$
})
