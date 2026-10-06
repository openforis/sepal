import {switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {assetSource$} from './export/assetSources.js'
import {startCollectionTileExport$} from './export/toAsset.js'
import {taskWorkloadTag} from './workloadTag.js'

export default job({
    jobName: 'Task export collection tile',
    jobPath: fileName(import.meta.url),
    workloadTag: ({image}) => taskWorkloadTag(image.recipe),
    worker$: ({requestArgs: {kind, tileIndex, tileId, ...params}}) => assetSource$(kind, params).pipe(
        switchMap(source => startCollectionTileExport$(source, {tileIndex, tileId}))
    )
})
