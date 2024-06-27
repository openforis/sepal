import {get$, post$, postJson$} from '~/http-client'

export default {
    healthcheck$: () =>
        get$('/api/gee/healthcheck', {
            maxRetries: 0
        }),

    preview$: ({recipe, ...params}) =>
        postJson$('/api/gee/preview', {
            body: {recipe, ...params},
            maxRetries: 0
        }),

    bands$: ({asset, recipe, ...params}) =>
        postJson$('/api/gee/bands', {
            body: {asset, recipe, ...params},
            maxRetries: 0
        }),

    histogram$: ({recipe, band, aoi, mapBounds, ...params}) =>
        postJson$('/api/gee/image/histogram', {
            body: {recipe, band, aoi, mapBounds, ...params},
            maxRetries: 0
        }),

    listAssets$: ({id}) =>
        get$('/api/gee/asset/list', {
            query: {id},
            maxRetries: 0
        }),

    createFolder$: ({id}) =>
        postJson$('/api/gee/asset/createFolder', {
            body: {id},
            maxRetries: 0
        }),

    assetMetadata$: ({asset, allowedTypes}) =>
        postJson$('/api/gee/assetMetadata', {
            body: {asset, allowedTypes},
            maxRetries: 0
        }),

    imageMetadata$: ({asset, recipe}) =>
        postJson$('/api/gee/imageMetadata', {
            body: {asset, recipe},
            maxRetries: 0
        }),

    distinctBandValues$: ({recipe, band, aoi, mapBounds}) =>
        postJson$('/api/gee/image/distinctBandValues', {
            body: {recipe, band, aoi, mapBounds},
            maxRetries: 0
        }),

    sampleImage$: ({asset, count, scale, classBand, recipe}) =>
        postJson$('/api/gee/image/sample', {
            body: {asset, count, scale, classBand, recipe},
            maxRetries: 0
        }),

    sceneAreas$: ({aoi, source}) =>
        postJson$('/api/gee/sceneareas', {
            body: {aoi, source},
            maxRetries: 0
        }),

    recipeGeometry$: ({recipe, color, fillColor}) =>
        postJson$('/api/gee/recipe/geometry', {
            body: {recipe, color, fillColor},
            maxRetries: 0
        }),

    recipeBounds$: recipe =>
        postJson$('/api/gee/recipe/bounds', {
            body: {recipe},
            maxRetries: 0
        }),

    aoiBounds$: aoi =>
        postJson$('/api/gee/aoi/bounds', {
            body: {aoi},
            maxRetries: 0
        }),

    loadEETableColumns$: tableId =>
        get$('/api/gee/table/columns', {
            query: {tableId},
            maxRetries: 0
        }),

    loadEETableColumnValues$: (tableId, columnName) =>
        get$('/api/gee/table/columnValues', {
            query: {tableId, columnName},
            maxRetries: 0
        }),

    loadEETableRows$: tableId =>
        get$('/api/gee/table/rows', {
            query: {tableId},
            maxRetries: 0
        }),

    eeTableMap$: ({tableId, columnName, columnValue, buffer, color, fillColor}) =>
        get$('/api/gee/table/map', {
            query: {tableId, columnName, columnValue, buffer, color, fillColor},
            maxRetries: 0
        }),

    queryEETable$: ({select, from, where, distinct, orderBy}) =>
        postJson$('/api/gee/table/query', {
            body: {select, from, where, distinct, orderBy},
            maxRetries: 0
        }),

    loadTimeSeriesObservations$: ({recipe, latLng, bands}) =>
        postJson$('/api/gee/timeSeries/loadObservations', {
            body: {recipe, latLng, bands},
            maxRetries: 0
        }),

    loadCCDCSegments$: ({recipe, latLng, bands}) =>
        postJson$('/api/gee/ccdc/loadSegments', {
            body: {recipe, latLng, bands},
            maxRetries: 0
        }),

    nextReferenceDataPoints$: recipe =>
        postJson$('/api/gee/nextReferenceDataPoints', {
            body: recipe,
            maxRetries: 0
        }),

    datasets$: (text, allowedTypes) =>
        get$('/api/gee/datasets', {
            query: {text, allowedTypes},
            maxRetries: 0
        }),

    listCompletedTasks$: () =>
        get$('/api/gee/task/listCompleted', {
            maxRetries: 0
        }),

    projects$: () =>
        get$('/api/gee/projects', {
            maxRetries: 0
        }),

    scenesInSceneArea$: ({sceneAreaId, dates, sources, sceneSelectionOptions}) =>
        get$(`/api/data/sceneareas/${sceneAreaId}`, {
            query: {
                query: JSON.stringify({dates, sources, sceneSelectionOptions})
            }
        }),

    autoSelectScenes$: ({sceneAreaIds, sources, dates, sceneSelectionOptions, sceneCount, cloudCoverTarget}) =>
        post$('/api/data/best-scenes', {
            body: {
                query: JSON.stringify({
                    sceneAreaIds, sources, dates, sceneSelectionOptions, sceneCount, cloudCoverTarget
                })
            }
        }),
}
