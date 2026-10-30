import datasets$ from '#gee/jobs/datasets/datasets'
import aoiBounds$ from '#gee/jobs/ee/aoi/bounds'
import aoiGeoId$ from '#gee/jobs/ee/aoi/geoId'
import aoiGeometry$ from '#gee/jobs/ee/aoi/geometry'
import createFolder$ from '#gee/jobs/ee/asset/createFolder'
import deleteAsset$ from '#gee/jobs/ee/asset/delete'
import listAssets$ from '#gee/jobs/ee/asset/list'
import assetMetadata$ from '#gee/jobs/ee/asset/metadata'
import renameAsset$ from '#gee/jobs/ee/asset/rename'
import assetVersions$ from '#gee/jobs/ee/asset/versions'
import loadCCDCSegments$ from '#gee/jobs/ee/ccdc/loadSegments'
import check$ from '#gee/jobs/ee/check'
import loadDiasObservations$ from '#gee/jobs/ee/dias/loadObservations'
import nextReferenceDataPoints$ from '#gee/jobs/ee/classification/nextReferenceDataPoints'
import imageBands$ from '#gee/jobs/ee/image/bands'
import imageBounds$ from '#gee/jobs/ee/image/bounds'
import distinctBandValues$ from '#gee/jobs/ee/image/distinctBandValues'
import imageJson$ from '#gee/jobs/ee/image/eeJson'
import imageGeometry$ from '#gee/jobs/ee/image/geometry'
import imageHistogram$ from '#gee/jobs/ee/image/histogram'
import landsatProductId$ from '#gee/jobs/ee/image/landsatProductId'
import preview$ from '#gee/jobs/ee/image/preview'
import sampleImage$ from '#gee/jobs/ee/image/sample'
import sceneAreas$ from '#gee/jobs/ee/image/sceneAreas'
import loadLandTrendrSegments$ from '#gee/jobs/ee/landTrendr/loadSegments'
import projects$ from '#gee/jobs/ee/projects'
import areaPerStratum$ from '#gee/jobs/ee/samplingDesign/areaPerStratum'
import probabilityPerStratum$ from '#gee/jobs/ee/samplingDesign/probabilityPerStratum'
import tableColumns$ from '#gee/jobs/ee/table/columns'
import tableColumnValues$ from '#gee/jobs/ee/table/columnValues'
import tableMap$ from '#gee/jobs/ee/table/map'
import tableQuery$ from '#gee/jobs/ee/table/query'
import tableRows$ from '#gee/jobs/ee/table/rows'
import listCompletedTasks$ from '#gee/jobs/ee/task/listCompleted'
import loadTimeSeriesbservations$ from '#gee/jobs/ee/timeSeries/loadObservations'
import taskDownloadCleanup$ from '#gee/jobs/task/downloadCleanup'
import taskDownloadFiles$ from '#gee/jobs/task/downloadFiles'
import taskExportCcdcToAsset$ from '#gee/jobs/task/exportCcdcToAsset'
import taskExportCollectionPrepare$ from '#gee/jobs/task/exportCollectionPrepare'
import taskExportCollectionTile$ from '#gee/jobs/task/exportCollectionTile'
import taskExportImageToAsset$ from '#gee/jobs/task/exportImageToAsset'
import taskExportImageToDrive$ from '#gee/jobs/task/exportImageToDrive'
import taskExportImageToSepal$ from '#gee/jobs/task/exportImageToSepal'
import taskExportTimeSeriesChunk$ from '#gee/jobs/task/exportTimeSeriesChunk'
import taskOperationCancel$ from '#gee/jobs/task/operationCancel'
import taskOperationStatus$ from '#gee/jobs/task/operationStatus'
import taskSamplingDesignCleanup$ from '#gee/jobs/task/samplingDesignCleanup'
import taskSamplingDesignStep$ from '#gee/jobs/task/samplingDesignStep'
import taskShareAsset$ from '#gee/jobs/task/shareAsset'
import taskTimeSeriesChunks$ from '#gee/jobs/task/timeSeriesChunks'
import taskTimeSeriesTiles$ from '#gee/jobs/task/timeSeriesTiles'
import {requireTaskSession} from '#gee/taskSession'
import {stream} from '#sepal/httpServer'

export default router =>
    router
        .post('/sceneareas', stream(ctx => sceneAreas$(ctx)))
        .post('/preview', stream(ctx => preview$(ctx)))
        .post('/bands', stream(ctx => imageBands$(ctx)))
        .get('/image/json', stream(ctx => {
            ctx.type = 'application/json'
            return imageJson$(ctx)
        }))
        .post('/image/histogram', stream(ctx => imageHistogram$(ctx)))
        .post('/image/distinctBandValues', stream(ctx => distinctBandValues$(ctx)))
        .post('/image/sample', stream(ctx => sampleImage$(ctx)))
        .post('/assetMetadata', stream(ctx => assetMetadata$(ctx)))
        .post('/assetVersions', stream(ctx => assetVersions$(ctx)))
        .get('/projects', stream(ctx => projects$(ctx)))
        .get('/asset/descendants', stream(ctx => listAssets$(ctx)))
        .post('/asset/createFolder', stream(ctx => createFolder$(ctx)))
        .post('/asset/rename', stream(ctx => renameAsset$(ctx)))
        .delete('/asset/delete', stream(ctx => deleteAsset$(ctx)))
        .get('/task/listCompleted', stream(ctx => listCompletedTasks$(ctx)))
        .post('/recipe/geometry', stream(ctx => imageGeometry$(ctx)))
        .post('/recipe/bounds', stream(ctx => imageBounds$(ctx)))
        .post('/aoi/bounds', stream(ctx => aoiBounds$(ctx)))
        .post('/aoi/geometry', stream(ctx => aoiGeometry$(ctx)))
        .post('/aoi/geoId', stream(ctx => aoiGeoId$(ctx)))
        .post('/ccdc/loadSegments', stream(ctx => loadCCDCSegments$(ctx)))
        .post('/dias/loadObservations', stream(ctx => loadDiasObservations$(ctx)))
        .post('/landTrendr/loadSegments', stream(ctx => loadLandTrendrSegments$(ctx)))
        .post('/timeSeries/loadObservations', stream(ctx => loadTimeSeriesbservations$(ctx)))
        .post('/nextReferenceDataPoints', stream(ctx => nextReferenceDataPoints$(ctx)))
        .get('/table/rows', stream(ctx => tableRows$(ctx)))
        .get('/table/columns', stream(ctx => tableColumns$(ctx)))
        .get('/table/columnValues', stream(ctx => tableColumnValues$(ctx)))
        .post('/table/query', stream(ctx => tableQuery$(ctx)))
        .get('/table/map', stream(ctx => tableMap$(ctx)))
        .post('/samplingDesign/areaPerStratum', stream(ctx => areaPerStratum$(ctx)))
        .post('/samplingDesign/probabilityPerStratum', stream(ctx => probabilityPerStratum$(ctx)))
        .get('/datasets', stream(ctx => datasets$(ctx)))
        .get('/landsatProductId', stream(ctx => landsatProductId$(ctx)))
        .post('/task/operation/status', requireTaskSession, stream(ctx => taskOperationStatus$(ctx)))
        .post('/task/operation/cancel', requireTaskSession, stream(ctx => taskOperationCancel$(ctx)))
        .post('/task/export/ccdc/asset', requireTaskSession, stream(ctx => taskExportCcdcToAsset$(ctx)))
        .post('/task/export/collection/prepare', requireTaskSession, stream(ctx => taskExportCollectionPrepare$(ctx)))
        .post('/task/export/collection/tile', requireTaskSession, stream(ctx => taskExportCollectionTile$(ctx)))
        .post('/task/export/image/asset', requireTaskSession, stream(ctx => taskExportImageToAsset$(ctx)))
        .post('/task/export/image/drive', requireTaskSession, stream(ctx => taskExportImageToDrive$(ctx)))
        .post('/task/export/image/sepal', requireTaskSession, stream(ctx => taskExportImageToSepal$(ctx)))
        .post('/task/export/timeseries/chunk', requireTaskSession, stream(ctx => taskExportTimeSeriesChunk$(ctx)))
        .post('/task/timeseries/tiles', requireTaskSession, stream(ctx => taskTimeSeriesTiles$(ctx)))
        .post('/task/timeseries/chunks', requireTaskSession, stream(ctx => taskTimeSeriesChunks$(ctx)))
        .post('/task/download/files', requireTaskSession, stream(ctx => taskDownloadFiles$(ctx)))
        .post('/task/download/cleanup', requireTaskSession, stream(ctx => taskDownloadCleanup$(ctx)))
        .post('/task/samplingDesign/step', requireTaskSession, stream(ctx => taskSamplingDesignStep$(ctx)))
        .post('/task/samplingDesign/cleanup', requireTaskSession, stream(ctx => taskSamplingDesignCleanup$(ctx)))
        .post('/task/asset/share', requireTaskSession, stream(ctx => taskShareAsset$(ctx)))
        .get('/healthcheck', stream(ctx => check$(ctx)))
