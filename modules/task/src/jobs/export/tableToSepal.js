const {swallow} = require('#sepal/rxjs')
const {concat, of} = require('rxjs')
const {exportLimiter$} = require('#task/jobs/service/exportLimiter')
const {task$} = require('#task/ee/task')
const ee = require('#sepal/ee/ee')
const _ = require('lodash')

// TODO: Implement...
// Look at toSepal.js
module.exports = {
    tableToSepal$: ({taskId, collection, description, assetId, strategy}) => {
        // Steps
        //      Export to drive or cloud storage
        //      Download to SEPAL
        //      Check if part of image export code can be reused.
        //      Except for the actual EE tasks and eventual GDAL processing
        //      there's no difference in these steps
        //
        // const serverConfig = ee.batch.Export.convertToServerParams(
        //     _.cloneDeep({collection, description, assetId}),
        //     ee.data.ExportDestination.ASSET,
        //     ee.data.ExportType.TABLE
        // )
        // const task = ee.batch.ExportTask.create(serverConfig)

        // return exportLimiter$(
        //     concat(
        //         strategy === 'replace'
        //             ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image', 'Table']}).pipe(swallow())
        //             : of(),
        //         task$(taskId, task, description)
        //     )
        // )
    }
}
