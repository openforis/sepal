const job = require('@sepal/worker/job')
const log = require('@sepal/log')

const worker$ = () => {
    const ee = require('@google/earthengine')
    require('./extensions')

    return new Promise((resolve, reject) => {
        log.trace('Initializing library')
        try {
            ee.initialize(
                null,
                null,
                () => resolve(),
                error => reject(error)
            )
        } catch (error) {
            reject(error)
        }
    })
}

module.exports = job({
    jobName: 'EE Initialization',
    before: [require('./authenticate')],
    worker$
})
