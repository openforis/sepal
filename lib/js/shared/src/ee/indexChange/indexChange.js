const ee = require('sepal/ee')
const {map, of, zip} = require('rxjs')
const imageFactory = require('sepal/ee/imageFactory')
const _ = require('lodash')

const createIndexChange =
    ({
        model: {
            fromImage,
            toImage,
            legend: {entries},
            options: {
                minConfidence = 2.5
            }
        }
    },
    {selection: selectedBands} = {selection: []}
    ) => {
        const hasError = fromImage && fromImage.errorBand && toImage && toImage.errorBand
        const hasChange = entries.length
        const selection = image => _.uniq([
            [image.band],
            image.errorBand ? [image.errorBand] : [],
        ].flat())
        return {
            getImage$() {
                return zip(
                    imageFactory(fromImage, {selection: selection(fromImage)}).getImage$(),
                    imageFactory(toImage, {selection: selection(toImage)}).getImage$()
                ).pipe(
                    map(([fromEEImage, toEEImage]) => {
                        const addConfidence = image => {
                            if (hasError) {
                                const confidence = image.select('difference').abs()
                                    .divide(image.select('error'))
                                    .rename('confidence')
                                return image
                                    .addBands(confidence)
                            } else {
                                return image
                            }
                        }

                        const addError = image => {
                            if (hasError) {
                                const error = ee.Image()
                                    .expression(
                                        'sqrt(fromError ** 2 + toError ** 2)', {
                                            fromError: fromEEImage.select(fromImage.errorBand),
                                            toError: toEEImage.select(toImage.errorBand),
                                        })
                                    .rename('error')
                                return image
                                    .addBands(error)
                            } else {
                                return image
                            }
                        }

                        const addChange = image => {
                            if (hasChange) {
                                const difference = hasError ?
                                    image.select('difference')
                                        .where(
                                            image.select('confidence').lte(minConfidence),
                                            ee.Image(0).rename('difference')
                                        )
                                    : image.select('difference')

                                const change = ee.mosaic(
                                    ee.ImageCollection(entries
                                        .reverse()
                                        .map(({value, constraints, booleanOperator}) => {
                                            return ee.Image(value)
                                                .updateMask(
                                                    toConstraintsMask({
                                                        images: {'this-recipe': difference},
                                                        constraints,
                                                        booleanOperator
                                                    })
                                                )
                                                .int8()
                                                .rename('change')
                                        }))
                                )
                                return image.addBands(change)
                            } else {
                                return image
                            }
                        }

                        const difference = toEEImage.select(toImage.band)
                            .subtract(fromEEImage.select(fromImage.band))
                            .rename('difference')

                        const normalizedDifference = ee.Image()
                            .expression(
                                '(to - from) / (to + from)', {
                                    from: fromEEImage.select(fromImage.band),
                                    to: toEEImage.select(toImage.band),
                                })
                            .float()
                            .rename('normalized_difference')

                        const ratio = toEEImage.select(toImage.band)
                            .divide(fromEEImage.select(fromImage.band))
                            .float()
                            .rename('ratio')

                        const image = addChange(
                            addConfidence(
                                addError(
                                    difference
                                        .addBands(normalizedDifference)
                                        .addBands(ratio)
                                )
                            )
                        ).clip(fromEEImage.geometry())
                        return selectedBands.length
                            ? image.select(_.uniq(selectedBands))
                            : image
                    })
                )
            },
            getBands$() {
                return of([
                    ['difference'],
                    ['normalized_difference'],
                    ['ratio'],
                    hasChange ? ['change'] : [],
                    hasError ? ['error'] : [],
                    hasError ? ['confidence'] : []
                ].flat())
            },
            getGeometry$() {
                return imageFactory(fromImage).getGeometry$()
            }
        }
    }

const toConstraintsMask = ({images, constraints = [], booleanOperator}) => {
    const constraintMasks = ee.ImageCollection(constraints
        .map(constraint => toConstraintMask({images, constraint}).int8().rename('mask'))
    )
    const mask = booleanOperator === 'and'
        ? constraintMasks.reduce(ee.Reducer.min())
        : constraintMasks.reduce(ee.Reducer.max())
    return mask
        .addBands(ee.Image(0)).select(0) // Protect against empty constraints, giving mask without bands. Mask the whole image in that case
}

const toConstraintMask = ({images, constraint}) => {
    const image = images[constraint.image].select(constraint.band)
    switch(constraint.operator) {
    case 'range': return (constraint.fromInclusive
        ? image.gte(constraint.from)
        : image.gt(constraint.from)
    ).and(constraint.toInclusive
        ? image.lte(constraint.to)
        : image.lt(constraint.to)
    )
    case '<': return image.lt(constraint.value)
    case '≤': return image.lte(constraint.value)
    case '>': return image.gt(constraint.value)
    case '≥': return image.gte(constraint.value)
    case '=': return image.eq(constraint.value)
    default: throw new Error(`Unexpected operator: ${constraint.operator}`)
    }
}

module.exports = createIndexChange
