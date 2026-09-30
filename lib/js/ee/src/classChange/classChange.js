import _ from 'lodash'
import {map, of, zip} from 'rxjs'

import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {CLASS_CHANGE_BANDS} from '#sepal/recipe/type/classChange'

const [{name: TRANSITION}, {name: CONFIDENCE}] = CLASS_CHANGE_BANDS

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
                            fromValues: fromImage.legendEntries.map(({value}) => value),
                            fromBand: fromImage.band,
                            toEEImage,
                            toValues: toImage.legendEntries.map(({value}) => value),
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
                return of(CLASS_CHANGE_BANDS.map(({name}) => name))
            },
            getGeometry$() {
                return imageFactory(fromImage).getGeometry$()
            }
        }
    }

// A transition needs only each image's classes. A confidence needs probabilities on both images: where either holds
// none, there is nothing to measure it from, so it is masked and minConfidence has nothing to act on. Decided from
// the images themselves, on the server, so the calculation that needs probabilities is never evaluated without them.
const calculateClassChange = ({
    fromEEImage,
    fromValues,
    fromBand,
    toEEImage,
    toValues,
    toBand,
    minConfidence
}) => {
    const classes = {
        fromValue: fromEEImage.select(fromBand),
        fromValues,
        fromBand,
        toValue: toEEImage.select(toBand),
        toValues,
        toBand
    }
    const fromValuesWithProbabilities = findValuesWithProbabilities(fromEEImage)
    const toValuesWithProbabilities = findValuesWithProbabilities(toEEImage)
    const classChange = ee.Algorithms.If(
        fromValuesWithProbabilities.size().gt(0).and(toValuesWithProbabilities.size().gt(0)),
        withConfidence({
            ...classes, fromEEImage, toEEImage, fromValuesWithProbabilities, toValuesWithProbabilities, minConfidence
        }),
        withoutConfidence(classes)
    )
    return ee.Image(classChange)
        .clip(fromEEImage.geometry())
}

const withConfidence = ({
    fromEEImage,
    fromValue,
    fromValues,
    fromBand,
    fromValuesWithProbabilities,
    toEEImage,
    toValue,
    toValues,
    toBand,
    toValuesWithProbabilities,
    minConfidence
}) => {
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
        .rename(CONFIDENCE)

    const mostProbableValue = toValue
        .where(toProbability.gt(fromProbability), toValue)
        .where(toProbability.lte(fromProbability), fromValue)

    const fromValueAdjusted = fromValue
        .where(confidence.lt(minConfidence), mostProbableValue)
    const toValueAdjusted = toValue
        .where(confidence.lt(minConfidence), mostProbableValue)

    return transition({fromValue: fromValueAdjusted, fromValues, fromBand, toValue: toValueAdjusted, toValues, toBand})
        .addBands(confidence)
}

const withoutConfidence = classes =>
    transition(classes)
        .addBands(ee.Image(0).float().updateMask(0).rename(CONFIDENCE))

// The codes classTransitions (#sepal/recipe/type/classChange) gives, from each class's position in its legend's order.
const transition = ({fromValue, fromValues, fromBand, toValue, toValues, toBand}) => {
    const fromIndex = valueIndex(fromValue, fromValues, fromBand)
    const toIndex = valueIndex(toValue, toValues, toBand)
    return fromIndex.multiply(toValues.length).add(toIndex).add(1)
        .int16()
        .rename(TRANSITION)
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

export default createClassChange
