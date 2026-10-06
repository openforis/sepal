import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {operationCancel$} from './operations.js'

export default job({
    jobName: 'Task operation cancel',
    jobPath: fileName(import.meta.url),
    worker$: ({requestArgs}) => operationCancel$(requestArgs)
})
