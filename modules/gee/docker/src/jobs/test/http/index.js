const job = require('root/jobs/job')

module.exports = job({
    jobName: 'Test1',
    jobPath: __filename,
    maxConcurrency: 200,
    minIdleCount: 5,
    maxIdleMilliseconds: 2000,
    services: [require('./testLimiter').limiter],
    before: [require('./test_1'), require('./test_2')],
    args: ({params: {min, max, errorProbability}}) => [parseInt(min), parseInt(max), parseInt(errorProbability)],
    worker$: require('./test')
})
