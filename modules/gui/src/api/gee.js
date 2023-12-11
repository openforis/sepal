import {get$, post$, postJson$} from 'http-client'

export default {
    preview$: ({recipe, ...params}) =>
        postJson$('/api/gee/preview', {
            body: {recipe, ...params},
            retries: 0
        }),

    bands$: ({asset, recipe, ...params}) =>
        postJson$('/api/gee/bands', {
            body: {asset, recipe, ...params}
        }),

    histogram$: ({recipe, band, aoi, mapBounds, ...params}) =>
        postJson$('/api/gee/image/histogram', {
            body: {recipe, band, aoi, mapBounds, ...params}
        }),

    listAssets$: ({id}) =>
        get$('/api/gee/asset/list', {
            query: {id},
            retries: 0
        }),

    assetMetadata$: ({asset, allowedTypes}) =>
        postJson$('/api/gee/assetMetadata', {
            body: {asset, allowedTypes},
            retries: 0
        }),

    imageMetadata$: ({asset, recipe}) =>
        postJson$('/api/gee/imageMetadata', {
            body: {asset, recipe},
            retries: 0
        }),

    distinctBandValues$: ({recipe, band, aoi, mapBounds}) =>
        postJson$('/api/gee/image/distinctBandValues', {
            body: {recipe, band, aoi, mapBounds},
            retries: 0
        }),

    sampleImage$: ({asset, count, scale, classBand, recipe}) =>
        postJson$('/api/gee/image/sample', {
            body: {asset, count, scale, classBand, recipe},
            retries: 0
        }),

    sceneAreas$: ({aoi, source}) =>
        postJson$('/api/gee/sceneareas', {
            body: {aoi, source}
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

    recipeGeometry$: ({recipe, color, fillColor}) =>
        postJson$('/api/gee/recipe/geometry', {
            body: {recipe, color, fillColor}
        }),

    recipeBounds$: recipe =>
        postJson$('/api/gee/recipe/bounds', {
            body: {recipe}
        }),

    aoiBounds$: aoi =>
        postJson$('/api/gee/aoi/bounds', {
            body: {aoi}
        }),

    loadEETableColumns$: tableId =>
        get$('/api/gee/table/columns', {
            query: {tableId}
        }),

    loadEETableColumnValues$: (tableId, columnName) =>
        get$('/api/gee/table/columnValues', {
            query: {tableId, columnName}
        }),

    loadEETableRows$: tableId =>
        get$('/api/gee/table/rows', {
            query: {tableId},
            retries: 0
        }),

    eeTableMap$: ({tableId, columnName, columnValue, buffer, color, fillColor}) =>
        get$('/api/gee/table/map', {
            query: {tableId, columnName, columnValue, buffer, color, fillColor}
        }),

    queryEETable$: ({select, from, where, distinct, orderBy}) =>
        postJson$('/api/gee/table/query', {
            body: {select, from, where, distinct, orderBy}
        }),

    loadTimeSeriesObservations$: ({recipe, latLng, bands}) =>
        postJson$('/api/gee/timeSeries/loadObservations', {
            body: {recipe, latLng, bands},
            retries: 0
        }),

    loadCCDCSegments$: ({recipe, latLng, bands}) =>
        postJson$('/api/gee/ccdc/loadSegments', {
            body: {recipe, latLng, bands},
            retries: 0
        }),

    nextReferenceDataPoints$: recipe =>
        postJson$('/api/gee/nextReferenceDataPoints', {
            body: recipe
        }),

    datasets$: (text, allowedTypes) =>
        get$('/api/gee/datasets', {
            query: {text, allowedTypes},
            retries: 0
        }),

    listCompletedTasks$: () =>
        get$('/api/gee/task/listCompleted', {
            retries: 0
        }),

    projects$: () =>
        get$('/api/gee/projects', {
            retries: 0
        }),
}
