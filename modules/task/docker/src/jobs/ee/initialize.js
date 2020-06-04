const job = require('root/jobs/job')
const {limiter} = require('sepal/ee/eeLimiter')

const worker$ = () => {
    const {swallow} = require('sepal/rxjs/operators')
    const ee = require('ee')

    return ee.$({
        operation: 'initialize',
        ee: (resolve, reject) => ee.initialize(null, null, resolve, reject)
    }).pipe(
        swallow()
    )
}

module.exports = job({
    jobName: 'EE Initialization',
    before: [require('./authenticate')],
    services: [limiter],
    worker$
})
