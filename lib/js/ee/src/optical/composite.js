const ee = require('#sepal/ee/ee')

const toComposite = ({collection, composingMethod}) => {
    return composingMethod === 'MEDIAN'
        ? median(collection)
        : medoid(collection)
}

const median = collection =>
    collection.median()

const medoid = collection => {
    const distance_bands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
    return collection
        .map(image =>
            image.addBands(
                image
                    .expression(
                        'pow(image - median, 2)', {
                            'image': image.select(distance_bands),
                            'median': collection.select(distance_bands).median()
                        })
                    .reduce(ee.Reducer.sum())
                    .sqrt()
                    .multiply(-1)
                    .rename(['distanceToMedian'])
            )
        )
        .qualityMosaic('distanceToMedian')
}

module.exports = {toComposite}
