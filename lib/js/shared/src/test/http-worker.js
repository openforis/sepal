const Job = require('#sepal/worker/job')
const {testLimiterService} = require('./http/testLimiter')

module.exports = Job()({
    jobName: 'Test',
    jobPath: __filename,
    initArgs: () => ({mode: 'Worker'}),
    maxConcurrency: 10,
    minIdleCount: 0,
    maxIdleMilliseconds: 5000,
    services: [testLimiterService],
    before: [require('./http/test_1'), require('./http/test_2')],
    args: ({params: {min, max, errorProbability}}) => [parseInt(min), parseInt(max), parseInt(errorProbability)],
    worker$: require('./http/test')
})
