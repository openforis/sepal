const Job = require('#sepal/worker/job')
const {testLimiterService} = require('./http/testLimiter')

module.exports = Job({
    jobName: 'Test',
    jobPath: __filename,
    schedulerName: 'GoogleEarthEngine',
    initArgs: () => ({mode: 'Worker'}),
    maxConcurrency: 2,
    minIdleCount: 0,
    maxIdleMilliseconds: 5000,
    services: [testLimiterService],
    before: [require('./http/test_1'), require('./http/test_2')],
    args: ({params: {min, max, errorProbability}}) => ({
        requestArgs: {
            minDuration: parseInt(min),
            maxDuration: parseInt(max),
            errorProbability: parseInt(errorProbability)
        }
    }),
    worker$: require('./http/test')
})
