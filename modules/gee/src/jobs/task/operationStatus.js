import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {operationStatus$} from './operations.js'

export default job({
    jobName: 'Task operation status',
    jobPath: fileName(import.meta.url),
    worker$: ({requestArgs}) => operationStatus$(requestArgs)
})
