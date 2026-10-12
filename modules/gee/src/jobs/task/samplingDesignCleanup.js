import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {cleanupTempAssets$} from './samplingDesign/samplingDesignSteps.js'

export default job({
    jobName: 'Task sampling design cleanup',
    jobPath: fileName(import.meta.url),
    worker$: ({requestArgs}) => cleanupTempAssets$(requestArgs)
})
