const {of} = require('rxjs')
const {toGeometry} = require('#sepal/ee/aoi')
const {createCollection} = require('./collection')
const {compose} = require('../functional')
const _ = require('lodash')
const {supportedIndexes, calculateIndex} = require('#sepal/ee/optical/indexes')

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

    const addIndexes = image =>
        selectedBands
            .filter(band => supportedIndexes().includes(band))
            .reduce(
                (acc, indexName) => acc.addBands(
                    calculateIndex(image, indexName)
                        .multiply(10000)
                        .int16()
                ),
                image
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
        return of(addIndexes(mosaic)
            .select(selectedBands.length > 0 ? _.uniq(selectedBands) : '.*')
            .clip(geometry)
        )
    }
    return {
        getImage$,
        getBands$() {
            return of(['blue', 'green', 'red', 'nir', 'ndvi', 'ndwi', 'evi', 'evi2', 'savi'])
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

module.exports = mosaic
