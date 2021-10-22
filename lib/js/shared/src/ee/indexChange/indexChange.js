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
        return {
            getImage$() {
                return zip(
                    imageFactory(fromImage).getImage$(),
                    imageFactory(toImage).getImage$()
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
                                const error = toEEImage.select(fromImage.errorBand)
                                    .add(fromEEImage.select(toImage.errorBand))
                                    .divide(2)
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

                                const change = ee.ImageCollection(entries
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
                                    })
                                ).mosaic()
                                return image.addBands(change)
                            } else {
                                return image
                            }
                        }

                        const difference = toEEImage.select(fromImage.band)
                            .subtract(fromEEImage.select(toImage.band))
                            .rename('difference')

                        const image = addChange(
                            addConfidence(
                                addError(
                                    difference
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
                of([
                    ['difference'],
                    hasChange ? ['change'] : [],
                    hasError ? ['error'] : []
                ].flat())
            },
            getGeometry$() {
                return imageFactory(fromImage).getGeometry$()
            }
        }
    }

const toConstraintsMask = ({images, constraints = [], booleanOperator}) => {
    const constraintMasks = ee.ImageCollection(constraints
        .map(constraint => toConstraintMask({images, constraint}).int8())
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
