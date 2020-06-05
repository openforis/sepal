const job = require('root/jobs/job')
const log = require('sepal/log').getLogger('worker')

module.exports = job({
    jobName: 'Test1',
    jobPath: __filename,
    initArgs: () => 'Test',
    maxConcurrency: 200,
    minIdleCount: 5,
    maxIdleMilliseconds: 2000,
    services: [require('./testLimiter').limiter],
    before: [require('./test_1'), require('./test_2')],
    args: ({params: {min, max, errorProbability}}) => [parseInt(min), parseInt(max), parseInt(errorProbability)],
    worker$: require('./test')
})
