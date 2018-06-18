import {SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import Http from 'http-client'
import moment from 'moment'
import {map} from 'rxjs/operators'

const api = {
    gee: {
        preview$: (recipe) =>
            Http.postJson$('gee/preview', transformRecipeForPreview(recipe)),
        sceneAreas$: ({aoi, source}) =>
            Http.get$('gee/sceneareas?' + transformQueryForSceneAreas(aoi, source)),
        scenesInSceneArea$: ({sceneAreaId, dates, sources}) =>
            Http.get$(`api/data/sceneareas/${sceneAreaId}?`
                + transformQueryForScenesInSceneArea({dates, sources})).pipe(
                map(({response: scenes}) =>
                    scenes
                        .map(({sceneId, sensor, acquisitionDate, cloudCover, browseUrl}) => ({
                            id: sceneId,
                            sceneAreaId,
                            dataSet: transformBackDataSet(sensor),
                            date: acquisitionDate,
                            daysFromTarget: daysFromTarget(acquisitionDate, dates),
                            cloudCover: Math.round(cloudCover),
                            browseUrl
                        }))
                        .filter(({date}) => inSeason(date, dates))
                        .filter(({dataSet}) => Object.values(sources)[0].includes(dataSet))
                )
            )
    }
}
export default api


const DATE_FORMAT = 'YYYY-MM-DD'

const inSeason = (date, dates) => {
    const doy = moment(date, DATE_FORMAT).dayOfYear()
    const fromDoy = moment(dates.seasonStart).dayOfYear()
    const toDoy = moment(dates.seasonEnd).dayOfYear()
    return toDoy <= fromDoy
        ? doy >= fromDoy || doy < toDoy
        : doy >= fromDoy && doy < toDoy
}

const transformRecipeForPreview = (recipe) => {
    const sceneIds = []
    Object.keys(recipe.scenes).forEach(sceneAreaId => recipe.scenes[sceneAreaId].forEach(scene => sceneIds.push(scene.id)))
    return {
        aoi: transformAoi(recipe.aoi),
        dates: recipe.dates,
        dataSet: sourcesToDataSet(recipe.sources),
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
        sceneIds: sceneIds,
        type: recipe.sceneSelectionOptions.type === SceneSelectionType.ALL ? 'automatic' : 'manual'
    }
}

const transformQueryForSceneAreas = (aoi, source) =>
    `aoi=${JSON.stringify(transformAoi(aoi))}&dataSet=${sourceToDataSet(source)}`

const transformQueryForScenesInSceneArea = ({dates, sources}) =>
    'dataSet=' + sourceToDataSet(Object.keys(sources)[0])
    + '&targetDayOfYear=' + targetDayOfYear(dates)
    + '&fromDate=' + fromDate(dates)
    + '&toDate=' + toDate(dates)


const targetDayOfYear = (dates) =>
    moment(dates.targetDate, DATE_FORMAT).dayOfYear()

const fromDate = (dates) =>
    moment(dates.seasonStart, DATE_FORMAT).subtract(dates.yearsBefore, 'years').format(DATE_FORMAT)

const toDate = (dates) =>
    moment(dates.seasonEnd, DATE_FORMAT).add(dates.yearsAfter, 'years').format(DATE_FORMAT)

const daysFromTarget = (dateString, dates) => {
    const date = moment(dateString, DATE_FORMAT)
    const targetDate = moment(dates.targetDate, DATE_FORMAT)
    const diffs = [
        date.diff(moment(targetDate).year(date.year() - 1), 'days'),
        date.diff(moment(targetDate).year(date.year()), 'days'),
        date.diff(moment(targetDate).year(date.year() + 1), 'days'),
    ]

    const min = Math.min(...diffs.map(Math.abs))
    return diffs.find(diff => Math.abs(diff) === min)
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
            case 'landsat8':
                return 'LANDSAT_8'
            case 'landsat7':
                return 'LANDSAT_7'
            case 'landsat45':
                return 'LANDSAT_TM'
            case 'landsat8T2':
                return 'LANDSAT_8_T2'
            case 'landsat7T2':
                return 'LANDSAT_7_T2'
            case 'landsat45T2':
                return 'LANDSAT_TM_T2'
            case 'sentinel2':
                return 'SENTINEL_2'
            default:
                throw new Error('Invalid dataSet: ' + dataSet)
        }
    })

const transformBackDataSet = (dataSet) => {
    switch (dataSet) {
        case 'LANDSAT_8':
            return 'landsat8'
        case 'LANDSAT_7':
            return 'landsat7'
        case 'LANDSAT_TM':
            return 'landsat45'
        case 'LANDSAT_8_T2':
            return 'landsat8T2'
        case 'LANDSAT_7_T2':
            return 'landsat7T2'
        case 'LANDSAT_TM_T2':
            return 'landsat45T2'
        case 'SENTINEL_2':
            return 'sentinel2'
        default:
            throw new Error('Invalid dataSet: ' + dataSet)
    }
}

const sourcesToDataSet = (sources) =>
    sources.landsat ? 'LANDSAT' : 'SENTINEL2'

const sourceToDataSet = (source) =>
    source === 'landsat' ? 'LANDSAT' : 'SENTINEL2'