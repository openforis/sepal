const job = require('root/jobs/job')
const {limiter} = require('sepal/ee/eeLimiter')

const worker$ = () => {
    const {EMPTY} = require('rxjs')
    const {switchMapTo} = require('rxjs/operators')
    const ee = require('ee')

    return ee.$('initalize', (resolve, reject) =>
        ee.initialize(
            null,
            null,
            () => resolve(),
            error => reject(error)
        )
    ).pipe(
        switchMapTo(EMPTY)
    )
}

module.exports = job({
    jobName: 'EE Initialization',
    before: [require('./authenticate')],
    services: [limiter],
    worker$
})
