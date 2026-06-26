import _ from 'lodash'
import {of, switchMap} from 'rxjs'

import {toGeometry} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {calculateIndex, supportedIndexes} from '#sepal/ee/optical/indexes'
import {validateEEImage} from '#sepal/ee/validate'

import {compose} from '../functional.js'
import {createCollection} from './collection.js'

const mosaic = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const geometry = toGeometry(model.aoi)
    const sources = model.sources || {
        source: 'BASEMAPS',
        assets: [
            'projects/planet-nicfi/assets/basemaps/africa',
            'projects/planet-nicfi/assets/basemaps/asia',
            'projects/planet-nicfi/assets/basemaps/americas'
        ]
    }
    const {histogramMatching = 'DISABLED', cloudThreshold = 0.15, shadowThreshold = 0.4, cloudBuffer = 0} = model.options || {}
    const toIndexes = image =>
        (selectedBands.length ? selectedBands : supportedIndexes())
            .filter(band => supportedIndexes().includes(band))
            .reduce(
                (acc, indexName) => acc.addBands(
                    calculateIndex(image, indexName)
                ),
                ee.Image([])
            )

    const getImage$ = () => {
        const {targetDate, startDate, endDate} = getDates(recipe)
        const collection = createCollection({
            targetDate,
            startDate,
            endDate,
            geometry,
            sources,
            histogramMatching,
            cloudThreshold,
            cloudBuffer
        })
        const mosaic = compose(
            collection,
            toComposite({shadowThreshold, sources, histogramMatching})
        )
        const indexes = toIndexes(mosaic)
        const scaledIndexes = indexes
            .bandNames()
            .iterate(
                (bandName, acc) =>
                    ee.Image(acc).addBands(
                        indexes.select([bandName]).multiply(10000).int16()
                    ),
                ee.Image([])
            )
        const image = mosaic
            .addBands(scaledIndexes)
            .select(selectedBands.length > 0 ? _.uniq(selectedBands) : '.*')
            .clip(geometry)

        return of(
            validateEEImage({
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
        )
    }
    return {
        getImage$,
        getBands$() {
            return getImage$().pipe(
                switchMap(image => ee.getInfo$(image.bandNames(), 'Get band names'))
            )
        },
        getGeometry$() {
            return of(geometry)
        }
    }
}

const getDates = recipe => {
    const {targetDate, fromDate, toDate} = recipe.model.dates
    return {targetDate, startDate: fromDate, endDate: toDate}
}

const toComposite = ({shadowThreshold, sources, histogramMatching}) =>
    collection => {
        if (sources.source === 'DAILY' && histogramMatching !== 'ENABLED') {
            return collection
                .median()
                .int16()
        } else {
            const medianBrightness = collection
                .select('brightness')
                .median()
                .rename('medianBrightness')

            return collection
                .map(function (image) {
                    const shadowScore = image
                        .select('brightness')
                        .addBands(medianBrightness)
                        .normalizedDifference(['medianBrightness', 'brightness'])
                    return image
                        .select(['blue', 'green', 'red', 'nir'])
                        .updateMask(shadowScore.lte(shadowThreshold))
                })
                .median()
                .int16()
        }
    }

export default mosaic
