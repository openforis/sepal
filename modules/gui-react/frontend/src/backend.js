import Http from 'http-client'

const api = {
    gee: {
        preview$: (recipe) => {
            return Http.postJson$('gee/preview', transformRecipeForPreview(recipe))
        }
    }
}
export default api

const transformRecipeForPreview = (recipe) => {
    return {
        aoi: transformAoi(recipe.aoi),
        dates: recipe.dates,
        dataSet: toDataSet(recipe.sources),
        sensors: toSensors(recipe.sources),
        targetDayOfYearWeight: 0,
        shadowTolerance: 1,
        hazeTolerance: 1,
        greennessWeight: 0,
        bands: ['red', 'green', 'blue'],
        surfaceReflectance: true,
        medianComposite: false,
        brdfCorrect: false,
        maskClouds: false,
        maskSnow: false,
        type: 'automatic'
    }
}

const transformAoi = (aoi) => {
    switch (aoi.type) {
        case 'fusionTable':
            return {
                type: 'fusionTable',
                tableName: aoi.id,
                keyColumn: aoi.keyColumn,
                keyValue: aoi.key
            }
        case 'polygon':
            return {
                type: 'polygon',
                path: aoi.path
            }
        default:
            throw new Error('Invalid AOI type: ', aoi)
    }
}

const toSensors = (sources) =>
    Object.values(sources)[0].map((dataSet) => {
        switch (dataSet) {
            case 'landsat8': return 'LANDSAT_8'
            case 'landsat7': return 'LANDSAT_7'
            case 'landsat45': return 'LANDSAT_TM'
            case 'landsat8T2': return 'LANDSAT_8_T2'
            case 'landsat7T2': return 'LANDSAT_7_T2'
            case 'landsa5T2': return 'LANDSAT_TM_T2'
            case 'sentinel2': return 'SENTINEL_2'
            default: throw new Error('Invalid dataSet: ' + dataSet)
        }
    })

const toDataSet = (sources) =>
    sources.landsat ? 'LANDSAT' : 'SENTINEL2'