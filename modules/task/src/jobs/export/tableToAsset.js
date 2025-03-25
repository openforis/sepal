const {swallow} = require('#sepal/rxjs')
const {concat, of} = require('rxjs')
const {exportLimiter$} = require('#task/jobs/service/exportLimiter')
const {task$} = require('#task/ee/task')
const ee = require('#sepal/ee')
const _ = require('lodash')

module.exports = {
    tableToAsset$: ({taskId, collection, description, assetId, strategy}) => {
        const serverConfig = ee.batch.Export.convertToServerParams(
            _.cloneDeep({collection, description, assetId}),
            ee.data.ExportDestination.ASSET,
            ee.data.ExportType.TABLE
        )
        const task = ee.batch.ExportTask.create(serverConfig)

        return exportLimiter$(
            concat(
                strategy === 'replace'
                    ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image', 'Table']}).pipe(swallow())
                    : of(),
                task$(taskId, task, description)
            )
        )
    }
}
