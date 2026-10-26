import {NEVER, of} from 'rxjs'

import {fileName} from '#sepal/path'
import Job from '#sepal/worker/job'

// Runs on the 'SchedulerTest' scheduler; with `crash`, it takes its worker thread down mid-job.
export default Job({
    jobName: 'ThreadJob',
    jobPath: fileName(import.meta.url),
    schedulerName: 'SchedulerTest',
    args: ({crash}) => ({crash}),
    worker$: ({crash}) => {
        if (crash) {
            setImmediate(() => {
                throw new Error('Worker thread crashed')
            })
            return NEVER
        }
        return of('done')
    }
})
