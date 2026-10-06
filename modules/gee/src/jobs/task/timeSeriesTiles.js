import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {timeSeriesTiles$} from './export/timeSeries.js'
import {taskWorkloadTag} from './workloadTag.js'

export default job({
    jobName: 'Task time-series tiles',
    jobPath: fileName(import.meta.url),
    workloadTag: ({image}) => taskWorkloadTag(image.recipe),
    worker$: ({requestArgs}) => timeSeriesTiles$(requestArgs)
})
