const ee = require('ee')
const {of} = require('rx')
const {toGeometry} = require('sepal/ee/aoi')
const {createCollection} = require('./collection')
const {toDateComposite, toTimeScan} = require('sepal/ee/radar/composite')
const {compose} = require('../functional')
const moment = require('moment')

const HARMONIC_BAND_PREFIXES = ['constant', 't', 'phase', 'amplitude', 'residuals']
const HARMONIC_BANDS = ['VV', 'VH']
    .map(band => HARMONIC_BAND_PREFIXES.map(prefix => `${band}_${prefix}`))
    .flat()

const mosaic = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const geometry = toGeometry(model.aoi)
    const {startDate, endDate, targetDate} = getDates(recipe)
    const {orbits, geometricCorrection, speckleFilter, outlierRemoval} = model.options
    const harmonicDependents = getHarmonicDependencies(selectedBands)
    return {
        getImage$() {
            const collection = createCollection({
                startDate,
                endDate,
                targetDate,
                geometry,
                orbits,
                geometricCorrection,
                speckleFilter,
                outlierRemoval,
                harmonicDependents
            })
            const mosaic = compose(
                collection,
                toComposite(targetDate),
                harmonicDependents.length && addHarmonics(collection),
            )
            return of(mosaic
                .select(selectedBands.length > 0 ? selectedBands : '.*')
                .clip(geometry)
            )
        },
        getVisParams$() {
            const bands = {
                VV: {range: [-20, 2]},
                VV_min: {range: [-25, 4]},
                VV_mean: {range: [-18, 6]},
                VV_median: {range: [-18, 6]},
                VV_max: {range: [-17, 10]},
                VV_stdDev: {range: [0, 5]},
                VV_CV: {range: [-6, 28]},
                VV_fitted: {range: [-22, 0]},
                VV_residuals: {range: [0, 2.4], stretch: [1, 0.5]},
                VV_t: {range: [-4, 4]},
                VV_phase: {range: [-3.14, 3.14]},
                VV_amplitude: {range: [0.5, 5]},
                VH: {range: [-22, 0]},
                VH_min: {range: [-34, 4]},
                VH_mean: {range: [-27, 0]},
                VH_median: {range: [-27, 0]},
                VH_max: {range: [-26, 2]},
                VH_stdDev: {range: [0, 6]},
                VH_fitted: {range: [-20, 2]},
                VH_residuals: {range: [0, 2.4], stretch: [1, 0.5]},
                VH_t: {range: [-4, 4]},
                VH_phase: {range: [-3.14, 3.14]},
                VH_amplitude: {range: [0.5, 5]},
                VH_CV: {range: [0, 35]},
                ratio_VV_median_VH_median: {range: [2, 16]},
                NDCV: {range: [-1, 1]},
                ratio_VV_VH: {range: [3, 14]},
                constant: {range: [-280, 215]},
                dayOfYear: {range: [0, 366], palette: '00FFFF, 000099'},
                daysFromTarget: {range: [0, 183], palette: '008000, FFFF00, FF0000'},
            }
            const min = selectedBands.map(band => bands[band].range[0])
            const max = selectedBands.map(band => bands[band].range[1])
            const stretch = selectedBands.map(band => bands[band].stretch)
            const palette = selectedBands.length === 1
                ? selectedBands[0].stretch
                : null
            const hsv = harmonicDependents.length > 0
            const visParams = {bands: selectedBands, min, max, stretch, palette, hsv}
            return of(visParams)
        },
        getGeometry$() {
            return of(geometry)
        }
    }
}

const getDates = recipe => {
    const {fromDate, toDate, targetDate} = recipe.model.dates
    const dateFormat = 'YYYY-MM-DD'
    const days = 366 / 2
    const startDate = targetDate && !fromDate
        ? moment(targetDate).add(-days, 'days').format(dateFormat)
        : fromDate
    const endDate = targetDate && !toDate
        ? moment(targetDate).add(days, 'days').format(dateFormat)
        : toDate
    return {startDate, endDate, targetDate}
}

const toComposite = targetDate =>
    collection => targetDate
        ? toDateComposite(collection, targetDate)
        : toTimeScan(collection)

const addHarmonics = collection =>
    image => image.addBands(ee.Image(collection.get('harmonics')))

const getHarmonicDependencies = selectedBands => [
    ...new Set((selectedBands.length ? selectedBands : HARMONIC_BANDS)
        .filter(harmonicBand)
        .map(band => {
            return band.replace(`_${harmonicBand(band)}`, '')
        }))
]

const harmonicBand = band =>
    HARMONIC_BAND_PREFIXES.find(harmonicBand => band.endsWith(`_${harmonicBand}`))

module.exports = mosaic
