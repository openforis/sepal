import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {cleanupDestination$} from './storage/destination.js'

export default job({
    jobName: 'Task download cleanup',
    jobPath: fileName(import.meta.url),
    worker$: ({requestArgs: {destination}, credentials: {sepalUser}}) => cleanupDestination$(destination, {sepalUser})
})
