const ee = require('#sepal/ee')
const {of} = require('rxjs')
const {toGeometry} = require('#sepal/ee/aoi')
const {createCollection} = require('./collection')
const {toDateComposite, toTimeScan} = require('#sepal/ee/radar/composite')
const {compose} = require('../functional')
const {getVisParams} = require('./visParams')
const moment = require('moment')
const _ = require('lodash')

const HARMONIC_BAND_PREFIXES = ['const', 't', 'phase', 'amp', 'res']
const HARMONIC_BANDS = ['VV', 'VH']
    .map(band => HARMONIC_BAND_PREFIXES.map(prefix => `${band}_${prefix}`))
    .flat()

const mosaic = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const geometry = toGeometry(model.aoi)
    const {orbits, geometricCorrection, speckleFilter, outlierRemoval} = model.options
    const harmonicDependents = getHarmonicDependencies(selectedBands)
    const getImage$ = () => {
        const {startDate, endDate, targetDate} = getDates(recipe)
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
            .select(selectedBands.length > 0 ? _.uniq(selectedBands) : '.*')
            .clip(geometry)
        )
    }
    return {
        getImage$,
        getBands$() {
            const type = (recipe.model.dates || {}).fromDate
                ? 'TIME_SCAN'
                : 'POINT_IN_TIME'
            return type === 'POINT_IN_TIME'
                ? of(['VV', 'VH', 'ratio_VV_VH', 'dayOfYear', 'daysFromTarget'])
                : of([
                    'VV_med', 'VV_mean', 'VV_min', 'VV_max', 'VV_std', 'VV_cv',
                    'VV_phase', 'VV_amp', 'VV_res', 'VV_const', 'VV_t',
                    'VH_med', 'VH_mean', 'VH_min', 'VH_max', 'VH_std', 'VH_cv',
                    'VH_phase', 'VH_amp', 'VH_res', 'VH_const', 'VH_t',
                    'ratio_VV_med_VH_med', 'NDCV'
                ])
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
