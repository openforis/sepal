const ee = require('#sepal/ee')

const toComposite = ({collection, composingMethod}) => {
    return composingMethod === 'MEDIAN'
        ? median(collection)
        : medoid(collection)
}

const median = collection =>
    collection.median()

const medoid = collection => {
    const distance_bands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
    const median = collection.select(distance_bands).median()
    return collection
        .map(image =>
            image.addBands(
                image.select(distance_bands)
                    .subtract(median)
                    .pow(2)
                    .reduce(ee.Reducer.sum())
                    .sqrt()
                    .multiply(-1)
                    .rename(['distanceToMedian'])
            )
        )
        .qualityMosaic('distanceToMedian')
}

module.exports = {toComposite}
