
import {fileName} from '#sepal/path'
import Job from '#sepal/worker/job'

import finalize$ from './http/finalize.js'
import {testLimiterService} from './http/testLimiter.js'
import worker$ from './http/worker.js'

export default Job({
    jobName: 'Test',
    jobPath: fileName(import.meta.url),
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
    worker$,
    finalize$
})
