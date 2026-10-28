import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {userStorageSerializerService} from '../service/userStorageSerializer.js'
import {startImageWorkspaceExport$} from './export/imageWorkspaceExport.js'
import {taskWorkloadTag} from './workloadTag.js'

export default job({
    jobName: 'Task export image to SEPAL',
    jobPath: fileName(import.meta.url),
    workloadTag: ({image}) => taskWorkloadTag(image.recipe),
    services: [userStorageSerializerService],
    worker$: ({requestArgs, credentials: {sepalUser}}) => startImageWorkspaceExport$(requestArgs, {sepalUser})
})
