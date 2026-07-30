import _ from 'lodash'
import {concat, of} from 'rxjs'

import ee from '#sepal/ee/ee'
import {swallow} from '#sepal/rxjs'
import {task$} from '#task/ee/task'
import {exportLimiter$} from '#task/jobs/service/exportLimiter'

export const tableToAsset$ = ({taskId, collection, description, assetId, strategy}) => {
    const serverConfig = ee.batch.Export.convertToServerParams(
        _.cloneDeep({collection, description, assetId}),
        ee.data.ExportDestination.ASSET,
        ee.data.ExportType.TABLE
    )
    const task = ee.batch.ExportTask.create(serverConfig)

    return exportLimiter$(
        concat(
            // Create any missing parent asset folders (mirrors image asset export); otherwise a valid
            // destination path that includes a new folder fails.
            ee.createParentFolder$(assetId, 1).pipe(swallow()),
            strategy === 'replace'
                ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image', 'Table']}).pipe(swallow())
                : of(),
            task$(taskId, task, description)
        )
    )
}
