const ee = require('sepal/ee')
const {map, of, zip} = require('rxjs')
const imageFactory = require('sepal/ee/imageFactory')
const _ = require('lodash')

const createClassChange =
    ({
        model: {
            fromImage,
            toImage,
            options: {
                minConfidence = 0
            }
        }
    },
    {selection: selectedBands} = {selection: []}
    ) => {
        return {
            getImage$() {
                return zip(
                    imageFactory(fromImage).getImage$(),
                    imageFactory(toImage).getImage$(),
                ).pipe(
                    map(([fromEEImage, toEEImage]) => {
                        const image = calculateClassChange({
                            fromEEImage,
                            fromValues: fromImage.legendEntries.map(({value}) => value).sort(),
                            fromBand: fromImage.band,
                            toEEImage,
                            toValues: toImage.legendEntries.map(({value}) => value).sort(),
                            toBand: toImage.band,
                            minConfidence
                        })
                        return selectedBands.length
                            ? image.select(_.uniq(selectedBands))
                            : image
                    })
                )
            },
            getBands$() {
                const hasConfidence = () => {
                    const fromEntries = fromImage.legendEntries
                        .map(({value, label}) => ({value, label}))
                    const toEntries = toImage.legendEntries
                        .map(({value, label}) => ({value, label}))
                    if (!_.isEqual(new Set(fromEntries), new Set(toEntries))) {
                        return false
                    } else {
                        const fromBands = Object.keys(fromImage.bands)
                        const toBands = Object.keys(toImage.bands)
                        const probabilityBands = fromEntries.map(({value}) => `probability_${value}`)
                        return probabilityBands.every(band => fromBands.includes(band))
                            && probabilityBands.every(band => toBands.includes(band))
                    }
                }

                return of([
                    ['transition'],
                    hasConfidence() ? ['confidence'] : []
                ].flat())
            },
            getGeometry$() {
                return imageFactory(fromImage).getGeometry$()
            }
        }
    }

const calculateClassChange = ({
    fromEEImage,
    fromValues,
    fromBand,
    toEEImage,
    toValues,
    toBand,
    minConfidence
}) => {
    const fromValue = fromEEImage.select(fromBand)
    const toValue = toEEImage.select(fromBand)

    const fromValuesWithProbabilities = findValuesWithProbabilities(fromEEImage)
    const toValuesWithProbabilities = findValuesWithProbabilities(toEEImage)

    const fromProbabilityArray = createProbabilityArray(fromEEImage, fromValuesWithProbabilities)
    const toProbabilityArray = createProbabilityArray(toEEImage, toValuesWithProbabilities)

    const maxNumberOfValues = fromValuesWithProbabilities.size().max(toValuesWithProbabilities.size())

    const fromProbability = getProbability(fromValue, fromProbabilityArray, fromValuesWithProbabilities, maxNumberOfValues)
    const toProbability = getProbability(toValue, toProbabilityArray, toValuesWithProbabilities, maxNumberOfValues)

    const fromInToProbability = getProbability(fromValue, toProbabilityArray, toValuesWithProbabilities, maxNumberOfValues)
    const toInFromProbability = getProbability(toValue, fromProbabilityArray, fromValuesWithProbabilities, maxNumberOfValues)

    const toCertainty = toProbability.subtract(fromInToProbability)
    const fromCertainty = fromProbability.subtract(toInFromProbability)
    const confidence = ee.ImageCollection([toCertainty, fromCertainty])
        .mean()
        .float()
        .rename('confidence')

    const mostProbableValue = toValue
        .where(toProbability.gt(fromProbability), toValue)
        .where(toProbability.lte(fromProbability), fromValue)

    const fromValueAdjusted = fromValue
        .where(confidence.lt(minConfidence), mostProbableValue)
    const toValueAdjusted = toValue
        .where(confidence.lt(minConfidence), mostProbableValue)

    const fromIndex = valueIndex(fromValueAdjusted, fromValues, fromBand)
    const toIndex = valueIndex(toValueAdjusted, toValues, toBand)

    const transition = fromIndex.multiply(toValues.length).add(toIndex).add(1)
        .int16()
        .rename('transition')

    return transition
        .addBands(confidence)
        .clip(fromEEImage.geometry())

}

const getProbability = (value, probabilityArray, valuesWithProbabilities, maxNumberOfValues) => {
    const probability = probabilityArray
        .arrayPad([maxNumberOfValues], -1)
        .arrayMask(
            ee.Image(ee.Array(valuesWithProbabilities))
                .arrayPad([maxNumberOfValues], -1)
                .eq(value)
        )
    return probability
        .updateMask(probability.arrayLength(0))
        .arrayGet([0])
}

const valueIndex = (value, values, band) => {
    const arrayMask = createArrayMask(value, values, band)
    const indexes = ee.Image(ee.Array(ee.List.sequence(0, ee.List(values).size().subtract(1))))
    const index = indexes
        .arrayMask(arrayMask)
    return index
        .updateMask(index.arrayLength(0))
        .arrayGet([0])
}

const createArrayMask = (image, values, band) => ee.Image(
    values.map(function (value) {
        return image.select(band).eq(value)
    })
).toArray()

const createProbabilityArray = (image, values) => ee.ImageCollection(
    values.map(function (value) {
        return image
            .select(
                ee.String('probability_').cat(ee.Number(value).format())
            )
            .rename('probability')
    })
).toBands().toArray()

const findValuesWithProbabilities = image => image
    .bandNames()
    .map(function (bandName) {
        return ee.String(bandName)
            .match('^probability_\\d*$')
            .slice(0, 1)
    })
    .flatten()
    .map(function (bandName) {
        const valueString = ee.String(bandName)
            .replace('probability_(\\d*)', '$1')
        return ee.Number.parse(valueString)
    })
    .sort()

module.exports = createClassChange
