const {job} = require('#gee/jobs/job')
const {testLimiterService} = require('./http/testLimiter')

module.exports = job({
    jobName: 'Test1',
    jobPath: __filename,
    initArgs: () => ({hello: 'Test'}),
    maxConcurrency: 200,
    minIdleCount: 5,
    maxIdleMilliseconds: 2000,
    services: [testLimiterService],
    before: [require('./http/test_1'), require('./http/test_2')],
    args: ({params: {min, max, errorProbability}}) => [parseInt(min), parseInt(max), parseInt(errorProbability)],
    worker$: require('./http/test')
})
