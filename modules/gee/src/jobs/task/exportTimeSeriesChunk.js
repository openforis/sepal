import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {userStorageSerializerService} from '../service/userStorageSerializer.js'
import {startTimeSeriesChunkExport$} from './export/timeSeries.js'
import {taskWorkloadTag} from './workloadTag.js'

export default job({
    jobName: 'Task export time-series chunk',
    jobPath: fileName(import.meta.url),
    workloadTag: ({image}) => taskWorkloadTag(image.recipe),
    services: [userStorageSerializerService],
    worker$: ({requestArgs, credentials: {sepalUser}}) => startTimeSeriesChunkExport$(requestArgs, {sepalUser})
})
