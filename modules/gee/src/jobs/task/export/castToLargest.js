import ee from '#sepal/ee/ee'

export const castToLargest = image => {
    const precisions = ee.List(['int', 'float', 'double'])
    const collection = ee.FeatureCollection(
        ee.List(
            ee.Dictionary(
                ee.Algorithms.Describe(image)
            ).get('bands')
        ).map(band => {
            const dataType = ee.Dictionary(
                ee.Dictionary(band).get('data_type')
            )
            const precision = dataType.getString('precision')
            const precisionIndex = precisions.indexOf(precision)
            const minValue = dataType
                .select(['min'], true)
                .values()
                .reduce(ee.Reducer.first())
            const maxValue = dataType
                .select(['max'], true)
                .values()
                .reduce(ee.Reducer.first())
            return ee.Feature(null, {
                precisionIndex,
                minValue,
                maxValue
            })
        })
    )
    const precision = precisions.getString(collection.aggregate_max('precisionIndex'))
    const minValue = ee.Algorithms.If(
        precision.equals('int'),
        collection.aggregate_min('minValue'),
        null
    )
    const maxValue = ee.Algorithms.If(
        precision.equals('int'),
        collection.aggregate_max('maxValue'),
        null
    )

    const pixelType = ee.PixelType({
        precision,
        minValue,
        maxValue
    })
    return image.cast(
        ee.Dictionary.fromLists(
            image.bandNames(),
            ee.List.repeat(pixelType, image.bandNames().size())
        )
    )
}
