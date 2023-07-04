const {job} = require('#gee/jobs/job')
const contextService = require('#gee/jobs/service/context').contextService

const worker$ = () => {
    const {configure} = require('#sepal/context')
    const {getContext$} = require('#gee/jobs/service/context')
    const {tap} = require('rxjs')
    const {swallow} = require('#sepal/rxjs')
    return getContext$().pipe(
        tap(context => configure(context)),
        swallow()
    )
}

module.exports = job({
    jobName: 'Configure shared library',
    before: [],
    services: [contextService],
    worker$
})
