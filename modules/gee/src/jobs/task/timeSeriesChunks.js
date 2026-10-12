import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {timeSeriesChunks$} from './export/timeSeries.js'
import {taskWorkloadTag} from './workloadTag.js'

export default job({
    jobName: 'Task time-series chunks',
    jobPath: fileName(import.meta.url),
    workloadTag: ({image}) => taskWorkloadTag(image.recipe),
    worker$: ({requestArgs}) => timeSeriesChunks$(requestArgs)
})
