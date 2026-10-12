import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {listDownloads$} from './storage/destination.js'

export default job({
    jobName: 'Task download files',
    jobPath: fileName(import.meta.url),
    worker$: ({requestArgs: {destination}, credentials: {sepalUser}}) => listDownloads$(destination, {sepalUser})
})
