import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {startCcdcAssetExport$} from './export/ccdcAssetExport.js'
import {taskWorkloadTag} from './workloadTag.js'

export default job({
    jobName: 'Task export CCDC to asset',
    jobPath: fileName(import.meta.url),
    workloadTag: ({image}) => taskWorkloadTag(image.recipe),
    worker$: ({requestArgs}) => startCcdcAssetExport$(requestArgs)
})
