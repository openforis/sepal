import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {userStorageSerializerService} from '../service/userStorageSerializer.js'
import {startImageDriveExport$} from './export/imageDriveExport.js'
import {taskWorkloadTag} from './workloadTag.js'

export default job({
    jobName: 'Task export image to Drive',
    jobPath: fileName(import.meta.url),
    workloadTag: ({image}) => taskWorkloadTag(image.recipe),
    services: [userStorageSerializerService],
    worker$: ({requestArgs, credentials: {sepalUser}}) => startImageDriveExport$(requestArgs, {sepalUser})
})
