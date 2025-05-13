const ee = require('#sepal/ee/ee')
const {of, map} = require('rxjs')
const {toGeometry$} = require('#sepal/ee/aoi')
const {createCollection} = require('./collection')
const {toDateComposite, toTimeScan} = require('#sepal/ee/radar/composite')
const {compose} = require('../functional')
const {getVisParams} = require('./visParams')
const moment = require('moment')
const _ = require('lodash')
const {validateEEImage} = require('#sepal/ee/validate')

const HARMONIC_BAND_PREFIXES = ['const', 't', 'phase', 'amp', 'res']
const HARMONIC_BANDS = ['VV', 'VH']
    .map(band => HARMONIC_BAND_PREFIXES.map(prefix => `${band}_${prefix}`))
    .flat()

const mosaic = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const harmonicDependents = getHarmonicDependencies(selectedBands)
    const getImage$ = () => {
        const {startDate, endDate, targetDate} = getDates(recipe)
        return toGeometry$(model.aoi).pipe(
            map(geometry => {
                const collection = createCollection({
                    startDate,
                    endDate,
                    targetDate,
                    geometry,
                    harmonicDependents,
                    ...model.options
                })
        
                const mosaic = compose(
                    collection,
                    toComposite(targetDate),
                    harmonicDependents.length && addHarmonics(collection)
                )
        
                const image = mosaic
                    .select(selectedBands.length > 0 ? _.uniq(selectedBands) : '.*')
                    .clip(geometry)
                    .set('speckleStatsCollection', collection.get('speckleStatsCollection'))
                    
                return validateEEImage({
                    valid: collection.limit(1).size(),
                    image,
                    error: {
                        userMessage: {
                            message: 'All images have been filtered out. Update the recipe to ensure at least one image is included.',
                            key: 'process.mosaic.error.noImages'
                        },
                        statusCode: 400
                    }
                })
            })
        )

    }
    return {
        getImage$,
        getBands$() {
            const type = (recipe.model.dates || {}).fromDate
                ? 'TIME_SCAN'
                : 'POINT_IN_TIME'
            return type === 'POINT_IN_TIME'
                ? of(['VV', 'VH', 'orbit', 'dayOfYear', 'daysFromTarget'])
                : of([
                    ['VV_min', 'VV_max', 'VV_mean', 'VV_std', 'VV_med', 'VH_min', 'VH_max', 'VH_mean', 'VH_std', 'VH_med', 'ratio_VV_med_VH_med', 'VV_cv', 'VH_cv', 'NDCV', 'orbit'],
                    harmonicDependents.length ? ['VV_phase', 'VV_amp', 'VV_res', 'VH_phase', 'VH_amp', 'VH_res'] : []
                ].flat())
        },
        getVisParams$() {
            return of(getVisParams(selectedBands, harmonicDependents))
        },
        getGeometry$() {
            return toGeometry$(model.aoi)
        }
    }
}

const getDates = recipe => {
    const {fromDate, toDate, targetDate} = recipe.model.dates
    const {outlierRemoval} = recipe.model.options
    const dateFormat = 'YYYY-MM-DD'
    const days = outlierRemoval === 'NONE   ' ? 30 : 366 / 2
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
    ...new Set((selectedBands?.length ? selectedBands : HARMONIC_BANDS)
        .filter(harmonicBand)
        .map(band => {
            return band.replace(`_${harmonicBand(band)}`, '')
        }))
]

const harmonicBand = band =>
    HARMONIC_BAND_PREFIXES.find(harmonicBand => band.endsWith(`_${harmonicBand}`))

module.exports = mosaic
