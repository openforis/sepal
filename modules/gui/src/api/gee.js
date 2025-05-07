import {get$, post$, postJson$} from '~/http-client'

export default {
    healthcheck$: () =>
        get$('/api/gee/healthcheck', {
            retry: {
                maxRetries: 0
            }
        }),

    preview$: ({recipe, ...params}) =>
        postJson$('/api/gee/preview', {
            body: {recipe, ...params},
            retry: {
                maxRetries: 0
            }
        }),

    bands$: ({asset, recipe, ...params}) =>
        postJson$('/api/gee/bands', {
            body: {asset, recipe, ...params},
            retry: {
                maxRetries: 0
            }
        }),

    histogram$: ({recipe, band, aoi, mapBounds, ...params}) =>
        postJson$('/api/gee/image/histogram', {
            body: {recipe, band, aoi, mapBounds, ...params},
            retry: {
                maxRetries: 0
            }
        }),

    createFolder$: ({id}) =>
        postJson$('/api/gee/asset/createFolder', {
            body: {id},
            retry: {
                maxRetries: 0
            }
        }),

    assetMetadata$: ({asset, allowedTypes}) =>
        postJson$('/api/gee/assetMetadata', {
            body: {asset, allowedTypes},
            retry: {
                maxRetries: 0
            }
        }),

    imageMetadata$: ({asset, recipe}) =>
        postJson$('/api/gee/imageMetadata', {
            body: {asset, recipe},
            retry: {
                maxRetries: 0
            }
        }),

    distinctBandValues$: ({recipe, band, aoi, mapBounds}) =>
        postJson$('/api/gee/image/distinctBandValues', {
            body: {recipe, band, aoi, mapBounds},
            retry: {
                maxRetries: 0
            }
        }),

    sampleImage$: ({recipeToSample, count, scale, classBand, recipe, bands}) =>
        postJson$('/api/gee/image/sample', {
            body: {recipeToSample, count, scale, classBand, recipe, bands},
            retry: {
                maxRetries: 0
            }
        }),

    sceneAreas$: ({aoi, source}) =>
        postJson$('/api/gee/sceneareas', {
            body: {aoi, source},
            retry: {
                maxRetries: 0
            }
        }),

    recipeGeometry$: ({recipe, color, fillColor}) =>
        postJson$('/api/gee/recipe/geometry', {
            body: {recipe, color, fillColor},
            retry: {
                maxRetries: 0
            }
        }),

    recipeBounds$: recipe =>
        postJson$('/api/gee/recipe/bounds', {
            body: {recipe},
            retry: {
                maxRetries: 0
            }
        }),

    aoiBounds$: aoi =>
        postJson$('/api/gee/aoi/bounds', {
            body: {aoi},
            retry: {
                maxRetries: 0
            }
        }),

    loadEETableColumns$: tableId =>
        get$('/api/gee/table/columns', {
            query: {tableId},
            retry: {
                maxRetries: 0
            }
        }),

    loadEETableColumnValues$: (tableId, columnName) =>
        get$('/api/gee/table/columnValues', {
            query: {tableId, columnName},
            retry: {
                maxRetries: 0
            }
        }),

    loadEETableRows$: (tableId, columns) =>
        get$('/api/gee/table/rows', {
            query: {tableId, columns},
            retry: {
                maxRetries: 0
            }
        }),

    eeTableMap$: ({tableId, columnName, columnValue, buffer, color, fillColor}) =>
        get$('/api/gee/table/map', {
            query: {tableId, columnName, columnValue, buffer, color, fillColor},
            retry: {
                maxRetries: 0
            }
        }),

    queryEETable$: ({select, from, where, distinct, orderBy}) =>
        postJson$('/api/gee/table/query', {
            body: {select, from, where, distinct, orderBy},
            retry: {
                maxRetries: 0
            }
        }),

    loadTimeSeriesObservations$: ({recipe, latLng, bands}) =>
        postJson$('/api/gee/timeSeries/loadObservations', {
            body: {recipe, latLng, bands},
            retry: {
                maxRetries: 0
            }
        }),

    loadCCDCSegments$: ({recipe, latLng, bands}) =>
        postJson$('/api/gee/ccdc/loadSegments', {
            body: {recipe, latLng, bands},
            retry: {
                maxRetries: 0
            }
        }),

    nextReferenceDataPoints$: recipe =>
        postJson$('/api/gee/nextReferenceDataPoints', {
            body: recipe,
            retry: {
                maxRetries: 0
            }
        }),

    datasets$: (text, allowedTypes) =>
        get$('/api/gee/datasets', {
            query: {text, allowedTypes},
            retry: {
                maxRetries: 0
            }
        }),

    listCompletedTasks$: () =>
        get$('/api/gee/task/listCompleted', {
            retry: {
                maxRetries: 0
            }
        }),

    projects$: () =>
        get$('/api/gee/projects', {
            retry: {
                maxRetries: 0
            }
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
