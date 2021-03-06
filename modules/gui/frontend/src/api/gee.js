import {get$, postForm$, postJson$} from 'http-client'
import {map} from 'rxjs/operators'

export default {
    preview$: ({recipe, ...params}) =>
        postJson$('/api/gee/preview', {body: {recipe, ...params}, retries: 0}),
    bands$: ({asset, recipe, ...params}) =>
        postJson$('/api/gee/bands', {body: {asset, recipe, ...params}, retries: 0})
            .pipe(toResponse),
    imageMetadata$: ({asset, recipe}) =>
        postJson$('/api/gee/imageMetadata', {body: {asset, recipe}, retries: 0})
            .pipe(toResponse),
    sampleImage$: ({asset, count, scale, classBand}) =>
        get$('/api/gee/image/sample',
            {query: {asset, count, scale, classBand}, retries: 0}
        ).pipe(toResponse),
    sceneAreas$: ({aoi, source}) =>
        postJson$('/api/gee/sceneareas', {
            body: {
                aoi,
                source
            }
        }).pipe(toResponse),
    scenesInSceneArea$: ({sceneAreaId, dates, sources, sceneSelectionOptions}) =>
        get$(`/api/data/sceneareas/${sceneAreaId}`, {
            query: {
                query: JSON.stringify({dates, sources, sceneSelectionOptions})
            }
        }).pipe(toResponse),
    autoSelectScenes$: ({sceneAreaIds, sources, dates, sceneSelectionOptions, sceneCount, cloudCoverTarget}) =>
        postForm$('/api/data/best-scenes', {
            body: {
                query: JSON.stringify({
                    sceneAreaIds, sources, dates, sceneSelectionOptions, sceneCount, cloudCoverTarget
                })
            }
        }).pipe(toResponse),
    recipeGeometry$: recipe =>
        postJson$('/api/gee/recipe/geometry', {body: {recipe}})
            .pipe(toResponse),
    loadEETableColumns$: tableId =>
        get$('/api/gee/table/columns',
            {query: {tableId}}
        ).pipe(toResponse),
    loadEETableColumnValues$: (tableId, columnName) =>
        get$('/api/gee/table/columnValues',
            {query: {tableId, columnName}}
        ).pipe(toResponse),
    loadEETableRows$: tableId =>
        get$('/api/gee/table/rows',
            {query: {tableId}, retries: 0}
        ).pipe(toResponse),
    eeTableMap$: ({tableId, columnName, columnValue, buffer, color, fillColor}) =>
        get$('/api/gee/table/map',
            {query: {tableId, columnName, columnValue, buffer, color, fillColor}}
        ).pipe(toResponse),
    queryEETable$: ({select, from, where, orderBy}) =>
        postJson$('/api/gee/table/query',
            {body: {select, from, where, orderBy}}
        ).pipe(toResponse),
    loadTimeSeriesObservations$: ({recipe, latLng, bands}) =>
        postJson$('/api/gee/timeSeries/loadObservations',
            {body: {recipe, latLng, bands}, retries: 0}
        ).pipe(toResponse),
    loadCCDCSegments$: ({recipe, latLng, bands}) =>
        postJson$('/api/gee/ccdc/loadSegments',
            {body: {recipe, latLng, bands}, retries: 0}
        ).pipe(toResponse),
    nextReferenceDataPoints$: recipe =>
        postJson$('/api/gee/nextReferenceDataPoints',
            {body: recipe}
        ).pipe(toResponse)
}

const toResponse = map(e => e.response)
