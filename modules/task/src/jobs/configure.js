const {job} = require('#task/jobs/job')
const contextService = require('#task/jobs/service/context').contextService

const worker$ = () => {
    const {configure} = require('#sepal/context')
    const {getCurrentContext$} = require('#task/jobs/service/context')
    const {tap} = require('rxjs')
    const {swallow} = require('#sepal/rxjs')
    return getCurrentContext$().pipe(
        tap(({config}) => configure(config)),
        swallow()
    )
}

module.exports = job({
    jobName: 'Configure shared library',
    services: [contextService],
    worker$
})
