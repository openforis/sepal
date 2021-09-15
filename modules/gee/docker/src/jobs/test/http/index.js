const {job} = require('root/jobs/job')
const {limiterService: eeLimiterService} = require('./testLimiter')

module.exports = job({
    jobName: 'Test1',
    jobPath: __filename,
    initArgs: () => ({hello: 'Test'}),
    maxConcurrency: 200,
    minIdleCount: 5,
    maxIdleMilliseconds: 2000,
    services: [eeLimiterService],
    before: [require('./test_1'), require('./test_2')],
    args: ({params: {min, max, errorProbability}}) => [parseInt(min), parseInt(max), parseInt(errorProbability)],
    worker$: require('./test')
})
