const ee = require('#sepal/ee/ee')
const applyBRDFCorrection = require('#sepal/ee/optical/imageProcess/applyBRDFCorrection')
const dataSetSpecs = require('#sepal/ee/optical/dataSetSpecs.json')

const createReference = (startDate, endDate, aoi) => {
    startDate = ee.Date(startDate)
    endDate = ee.Date(endDate)
    const days = ee.Date(endDate).difference(ee.Date(startDate), 'days').floor()
    const minDays = ee.Number(32)
    const adjustment = minDays.subtract(days).divide(2).max(0)
    const referenceStartDate = startDate.advance(adjustment.multiply(-1), 'days')
    const referenceEndDate = endDate.advance(adjustment, 'days')
    const referenceCollection = ee.ImageCollection(
        [2, -2, 1, -1, 0].map(toReference)
    ).filterMetadata('system:band_names', 'not_equals', [])
    return referenceCollection.mosaic()

    function toReference(yearOffset) {
        return landsatReference(referenceStartDate, referenceEndDate, yearOffset, aoi)
    }

    function landsatReference(referenceStartDate, referenceEndDate, yearOffset, aoi) {
        const dataSetSpec = dataSetSpecs.SR.LANDSAT_8
        return ee.ImageCollection(dataSetSpec.collectionName)
            .filterDate(
                referenceStartDate.advance(yearOffset, 'years'),
                referenceEndDate.advance(yearOffset, 'years')
            )
            .filterBounds(aoi)
            .select(
                ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'QA_PIXEL'],
                ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'qa']
            )
            .map(image => {
                const normalizedImage = image.addBands(
                    ee.Image(image
                        .select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2'])
                        .multiply(dataSetSpec.bands.blue.scale)
                        .add(dataSetSpec.bands.blue.offset)
                    ), null, true
                )
                return mask(
                    applyBRDFCorrection(dataSetSpec)(normalizedImage)
                        .multiply(10000)
                        .int16()
                        .addBands(image.select('qa'), null, true)
                ).select(['blue', 'green', 'red', 'nir'])
            })
            .median()
    }

    function mask(image) {
        return image
        // const qa = image.select('qa')
        // const cloudShadow = bitwiseExtract(qa, 4)
        // const snow = bitwiseExtract(qa, 5).rename('snow')
        // const cloud = bitwiseExtract(qa, 6).not().rename('cloud')
        // return image.updateMask(
        //     cloudShadow.not()
        //         .and(snow.not())
        //         .and(cloud.not())
        //
        // )
    }
}

const histogramMatch = (target, reference, referenceScale, targetScale) => {
    reference = reference.clip(target.geometry())
    const bandNames = ['blue', 'green', 'red', 'nir']

    const getHistData = function (image, band, scale) {
        const histogram = image.reduceRegion({
            reducer: ee.Reducer.histogram({
                maxBuckets: Math.pow(2, 8)
            }),
            geometry: image.geometry(),
            scale,
            maxPixels: 1e9,
            tileScale: 16
        })
        // Get the list of DN values (x-axis of the histogram)
        const dnListFoo = ee.List(ee.Dictionary(histogram.get(band)).get(
            'bucketMeans',
            [0, 0] // Have a fall back value for images where no histogram can be created, to prevent things breaking
        ))
        const dnListFooSize = dnListFoo.size().max(2)
        const dnList = dnListFoo.cat([0, 0]).slice(0, dnListFooSize)
        // Get the list of Counts values (y-Axis of the histogram)
        const countsListFoo = ee.List(ee.Dictionary(histogram.get(band)).get(
            'histogram',
            [0, 0] // Have a fall back value for images where no histogram can be created, to prevent things breaking
        ))
        const countsListSize = countsListFoo.size().max(2)
        const countsList = countsListFoo.cat([0, 0]).slice(0, countsListSize)
        // Compute the cumulative sum of the counts
        const cumulativeCountsArray = ee.Array(countsList).accum({
            axis: 0
        })
        // The last element of the array is the total count, so extract it.
        const totalCount = cumulativeCountsArray.get([-1])
        // Divide each value by the total so that the values are between 0 and 1
        // This will be the cumulative probability at each DN
        const cumulativeProbabilities = cumulativeCountsArray.divide(totalCount)

        // Create a merged array with DN and cumulative probabilities
        const array = ee.Array.cat({
            arrays: [dnList, cumulativeProbabilities],
            axis: 1
        })

        // FeatureCollections give is a lot of flexibility such as charting, classification etc.
        // Convert the array into a feature collection with null geometries
        const fc = ee.FeatureCollection(array.toList().map(function (list) {
            return ee.Feature(null, {
                dn: ee.List(list).get(0),
                probability: ee.List(list).get(1)
            })
        }))
        return fc
    }

    const equalize = function (referenceImage, targetImage, band) {
        const referenceHistData = getHistData(referenceImage, band, referenceScale)
        const targetHistData = getHistData(targetImage, band, targetScale)

        const dnToProb = ee.Classifier.smileRandomForest(15)
            .setOutputMode('REGRESSION')
            .train({
                features: targetHistData,
                classProperty: 'probability',
                inputProperties: ['dn']
            })

        const probToDn = ee.Classifier.smileRandomForest(15)
            .setOutputMode('REGRESSION')
            .train({
                features: referenceHistData,
                classProperty: 'dn',
                inputProperties: ['probability']
            })

        // Now we can take the target image and get cumulative probability
        const targetImageProb = targetImage.select(band).rename('dn').classify(dnToProb, 'probability')
        const targetImageDn = targetImageProb.classify(probToDn, band)
        return targetImageDn
    }

    const match = function (referenceImage, targetImage, bandNames) {
        const matchedBands = bandNames.map(function (band) {
            return equalize(referenceImage, targetImage, band)
        })
        return ee.Image.cat(matchedBands)
    }

    return match(reference, target, bandNames).int16()
}

module.exports = {createReference, histogramMatch}
