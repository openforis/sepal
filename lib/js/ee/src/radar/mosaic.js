import _ from 'lodash'
import moment from 'moment'
import {map, of} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {TIME_SCAN_BANDS, toDateComposite, toTimeScan} from '#sepal/ee/radar/composite'
import {validateEEImage} from '#sepal/ee/validate'

import {compose} from '../functional.js'
import {createCollection} from './collection.js'
import {HARMONIC_BAND_SUFFIXES} from './harmonics.js'
import {getVisParams} from './visParams.js'

const harmonicBandsOf = dependent =>
    HARMONIC_BAND_SUFFIXES.map(suffix => `${dependent}_${suffix}`)

// Every harmonic band of both polarisations, which is what an operation naming no selection depends on.
const HARMONIC_BANDS = ['VV', 'VH'].flatMap(harmonicBandsOf)

const mosaic = (recipe, {selection: selectedBands = []} = {}) => {
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
                ? of(['VV', 'VH', 'ratio_VV_VH', 'orbit', 'dayOfYear', 'daysFromTarget'])
                : of([
                    ...TIME_SCAN_BANDS,
                    ...harmonicDependents.flatMap(harmonicBandsOf)
                ])
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
    HARMONIC_BAND_SUFFIXES.find(suffix => band.endsWith(`_${suffix}`))

export default mosaic
