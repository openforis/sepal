import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {startImageAssetExport$} from './export/imageAssetExport.js'
import {taskWorkloadTag} from './workloadTag.js'

export default job({
    jobName: 'Task export image to asset',
    jobPath: fileName(import.meta.url),
    workloadTag: ({image}) => taskWorkloadTag(image.recipe),
    worker$: ({requestArgs}) => startImageAssetExport$(requestArgs)
})
