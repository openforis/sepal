import {fileURLToPath} from 'url'
import Job from '#sepal/worker/job'
import {testLimiterService} from './http/testLimiter.js'
import worker$ from './http/worker.js'
import finalize$ from './http/finalize.js'

const __filename = fileURLToPath(import.meta.url)

export default Job({
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
    worker$,
    finalize$
})
