import _ from 'lodash'
import moment from 'moment'
import {map, of} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {toDateComposite, toTimeScan} from '#sepal/ee/radar/composite'
import {validateEEImage} from '#sepal/ee/validate'
import {
    HARMONIC_BAND_SUFFIXES,
    HARMONIC_POLARISATIONS,
    harmonicBands,
    POINT_IN_TIME,
    radarMosaicBands,
    radarMosaicConfiguration
} from '#sepal/recipe/type/radarMosaic'

import {compose} from '../functional.js'
import {createCollection} from './collection.js'
import {getVisParams} from './visParams.js'

// Every harmonic band of both polarisations, which is what an operation naming no selection depends on.
const HARMONIC_BANDS = HARMONIC_POLARISATIONS.flatMap(harmonicBands)

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
                    toComposite(model, targetDate),
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
        // The declared output of the configuration, whatever a request selects: which harmonics are computed for it is
        // the image's concern.
        getBands$() {
            return of(radarMosaicBands(model).map(({name}) => name))
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

const toComposite = (model, targetDate) =>
    collection => radarMosaicConfiguration(model) === POINT_IN_TIME
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
