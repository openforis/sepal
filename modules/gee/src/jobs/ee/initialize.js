const {job} = require('#gee/jobs/job')
const {eeLimiterService} = require('#sepal/ee/eeLimiterService')

const worker$ = () => {
    const {swallow} = require('#sepal/rxjs')
    const ee = require('#sepal/ee')

    const DEFAULT_MAX_RETRIES = 3

    return ee.$({
        operation: 'initialize',
        ee: (resolve, reject) => {
            ee.setMaxRetries(DEFAULT_MAX_RETRIES)
            ee.initialize(null, null, resolve, reject)
        }
    }).pipe(
        swallow()
    )
}

module.exports = job({
    jobName: 'EE Initialization',
    before: [require('./authenticate')],
    services: [eeLimiterService],
    worker$
})
