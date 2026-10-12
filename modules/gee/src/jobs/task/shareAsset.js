import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {shareAsset$} from './operations.js'

export default job({
    jobName: 'Task share asset',
    jobPath: fileName(import.meta.url),
    worker$: ({requestArgs}) => shareAsset$(requestArgs)
})
