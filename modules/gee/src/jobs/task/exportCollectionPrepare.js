import {switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {assetSource$} from './export/assetSources.js'
import {prepareImageCollection$} from './export/toAsset.js'
import {taskWorkloadTag} from './workloadTag.js'

export default job({
    jobName: 'Task export collection prepare',
    jobPath: fileName(import.meta.url),
    workloadTag: ({image}) => taskWorkloadTag(image.recipe),
    worker$: ({requestArgs: {kind, ...params}}) => assetSource$(kind, params).pipe(
        switchMap(source => prepareImageCollection$(source))
    )
})
