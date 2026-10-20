import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {userStorageSerializerService} from '../service/userStorageSerializer.js'
import {startEEObjectExport$} from './export/eeObjectExport.js'

export default job({
    jobName: 'Task export Earth Engine object',
    jobPath: fileName(import.meta.url),
    workloadTag: () => 'sepal-task-ee-export',
    services: [userStorageSerializerService],
    worker$: ({requestArgs, credentials: {sepalUser}}) => startEEObjectExport$(requestArgs, {sepalUser})
})
