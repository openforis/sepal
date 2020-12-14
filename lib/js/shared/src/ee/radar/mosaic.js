const ee = require('ee')
const {of} = require('rx')
const {toGeometry} = require('sepal/ee/aoi')
const {createCollection} = require('./collection')
const {toDateComposite, toTimeScan} = require('sepal/ee/radar/composite')
const {compose} = require('../functional')
const {getVisParams} = require('./visParams')
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
                harmonicDependents.length && addHarmonics(collection)
            )
            return of(mosaic
                .select(selectedBands.length > 0 ? selectedBands : '.*')
                .clip(geometry)
            )
        },
        getVisParams$() {
            return of(getVisParams(selectedBands, harmonicDependents))
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
