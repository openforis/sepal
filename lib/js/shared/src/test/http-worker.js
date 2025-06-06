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
    args: ({params: {
        workerMin,
        workerMax,
        workerErrorProbability,
        finalizeMin,
        finalizeMax,
        finalizeErrorProbability
    }}) => ({
        requestArgs: {
            workerMinDuration: parseInt(workerMin),
            workerMaxDuration: parseInt(workerMax),
            workerErrorProbability: parseInt(workerErrorProbability),
            finalizeMinDuration: parseInt(finalizeMin),
            finalizeMaxDuration: parseInt(finalizeMax),
            finalizeErrorProbability: parseInt(finalizeErrorProbability)
        }
    }),
    worker$: require('./http/worker'),
    finalize$: require('./http/finalize')
})
