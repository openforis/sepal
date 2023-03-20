const Job = require('#sepal/worker/job')
const {testLimiterService} = require('./http/testLimiter')

module.exports = Job()({
    jobName: 'Test',
    jobPath: __filename,
    initArgs: () => ({mode: 'Worker'}),
    maxConcurrency: 200,
    minIdleCount: 5,
    maxIdleMilliseconds: 2000,
    services: [testLimiterService],
    before: [require('./http/test_1'), require('./http/test_2')],
    args: ({params: {min, max, errorProbability}}) => [parseInt(min), parseInt(max), parseInt(errorProbability)],
    worker$: require('./http/test')
})
