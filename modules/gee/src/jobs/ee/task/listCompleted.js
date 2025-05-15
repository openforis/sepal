const {job} = require('#gee/jobs/job')

const worker$ = ({
    credentials: {sepalUser: {googleTokens}}
}) => {
    const {map} = require('rxjs')
    const ee = require('#sepal/ee/ee')
    const _ = require('lodash')

    if (!googleTokens) {
        throw Error('Requires a connected Google Account')
    }

    const mapResults = operations =>
        operations
            .filter(({done, error}) => done && !error)
            .map(({name}) => name)

    return ee.listOperations$().pipe(
        map(mapResults)
    )
}

module.exports = job({
    jobName: 'EE completed tasks',
    jobPath: __filename,
    worker$
})
