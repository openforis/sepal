const {job} = require('root/jobs/job')
const contextService = require('root/jobs/service/context').contextService

const worker$ = () => {
    const {configure} = require('sepal/context')
    const {getCurrentContext$} = require('root/jobs/service/context')
    const {tap} = require('rxjs')
    const {swallow} = require('sepal/rxjs')
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
