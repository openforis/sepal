const ee = require('#sepal/ee')
const {createReference, histogramMatch} = require('#sepal/ee/histogramMatch')

const histogramMatchCollection = ({collection, geometry, startDate, endDate}) => {
    const reference = createReference(startDate, endDate, geometry)
    return collection.map(image => {
        return histogramMatch(image.int16(), reference, 100, 100)
            .set('system:time_start', image.date().millis())
    })
}

const processDailyCollection = ({collection, geometry, startDate, endDate, histogramMatching}) => {
    const udm1Collection = collection
        .filter(ee.Filter.eq(
            'system:band_names',
            ['B1', 'B2', 'B3', 'B4', 'udm1']
        ))
        .map(function (image) {
            const mask = image.select('udm1').not()
            return image.updateMask(mask)
        })
        .select(['B1', 'B2', 'B3', 'B4'], ['blue', 'green', 'red', 'nir'])

    const udm2Collection = collection
        .filter(ee.Filter.eq(
            'system:band_names',
            ['B1', 'B2', 'B3', 'B4', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']
        ))
        .map(function (image) {
            const qa = image.select(
                ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
                ['clear', 'snow', 'shadow', 'lightHaze', 'heavyHaze', 'cloud', 'confidence']
            )
            const mask = qa.select('clear')
                .and(qa.select('snow').not())
                .and(qa.select('shadow').not())
                .and(qa.select('lightHaze').not())
                .and(qa.select('heavyHaze').not())
                .and(qa.select('cloud').not())
                .and(qa.select('confidence')) // Actually between 0 and 100, but I'll mask out pixels with no confidence
            return image.updateMask(mask)
        })
        .select(['B1', 'B2', 'B3', 'B4'], ['blue', 'green', 'red', 'nir'])

    const processedCollection = udm1Collection
        .merge(udm2Collection)
    return histogramMatching === 'ENABLED'
        ? histogramMatchCollection({
            collection: processedCollection,
            geometry,
            startDate,
            endDate
        })
        : processedCollection
}

module.exports = {processDailyCollection}
