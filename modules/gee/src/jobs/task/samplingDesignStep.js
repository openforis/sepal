import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {userStorageSerializerService} from '../service/userStorageSerializer.js'
import {samplingDesignStep$} from './samplingDesign/samplingDesignSteps.js'
import {taskWorkloadTag} from './workloadTag.js'

export default job({
    jobName: 'Task sampling design step',
    jobPath: fileName(import.meta.url),
    workloadTag: ({recipe}) => taskWorkloadTag(recipe),
    services: [userStorageSerializerService],
    worker$: ({requestArgs, credentials: {sepalUser}}) => samplingDesignStep$(requestArgs, {sepalUser})
})
