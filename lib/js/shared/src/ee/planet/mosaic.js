const {of} = require('rxjs')
const {toGeometry} = require('sepal/ee/aoi')
const {createCollection} = require('./collection')
const {compose} = require('../functional')
const _ = require('lodash')

const mosaic = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const geometry = toGeometry(model.aoi)
    const {cloudThreshold = 0.15, shadowThreshold = 0.4} = model.options || {}
    const getImage$ = () => {
        const {startDate, endDate} = getDates(recipe)
        const collection = createCollection({
            startDate,
            endDate,
            geometry,
            cloudThreshold
        })
        const mosaic = compose(
            collection,
            toComposite(shadowThreshold)
        )
        return of(mosaic
            .select(selectedBands.length > 0 ? _.uniq(selectedBands) : '.*')
            .clip(geometry)
        )
    }
    return {
        getImage$,
        getBands$() {
            return of(['blue', 'green', 'red', 'nir'])
        },
        getGeometry$() {
            return of(geometry)
        }
    }
}

const getDates = recipe => {
    const {fromDate, toDate} = recipe.model.dates
    return {startDate: fromDate, endDate: toDate}
}

const toComposite = shadowThreshold =>
    collection => {
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
                    .select(['blue', 'green', 'red', 'nir', 'ndvi'])
                    .updateMask(shadowScore.lte(shadowThreshold))
            })
            .median()
    }

module.exports = mosaic
