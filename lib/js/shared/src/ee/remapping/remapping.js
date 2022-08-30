const ee = require('sepal/ee')
const {map, of, zip} = require('rxjs')
const imageFactory = require('sepal/ee/imageFactory')
const _ = require('lodash')

const remap =
    ({
        model: {
            inputImagery: {images},
            legend: {entries = []} = {},
        }
    },
    {selection: selectedBands} = {selection: []}
    ) => {
        return {
            getImage$() {
                return zip(
                    ...images.map(image => {
                        return imageFactory(image, {selection: image.includedBands.map(({band}) => band)}).getImage$()
                    })
                ).pipe(
                    map(eeImages => {
                        const eeImageById = {}
                        images.forEach(({imageId}, i) =>
                            eeImageById[imageId] = eeImages[i]
                        )
                        const image = ee.mosaic(
                            ee.ImageCollection(entries
                                .reverse()
                                .map(({value, constraints, booleanOperator}) => {
                                    return ee.Image(value)
                                        .updateMask(
                                            toConstraintsMask({
                                                eeImageById,
                                                constraints,
                                                booleanOperator
                                            })
                                        )
                                        .int8()
                                        .rename('class')
                                }))
                        )
                        return selectedBands.length
                            ? image.select(_.uniq(selectedBands))
                            : image
                    })
                )
            },
            getBands$() {
                return of(['class'])
            },
            getGeometry$() {
                return imageFactory(images[0]).getGeometry$()
            }
        }
    }

const toConstraintsMask = ({eeImageById, constraints = [], booleanOperator}) => {
    const constraintMasks = ee.ImageCollection(constraints
        .map(constraint => toConstraintMask({eeImageById, constraint}).int8().rename('mask'))
    )
    const mask = booleanOperator === 'and'
        ? constraintMasks.reduce(ee.Reducer.min())
        : constraintMasks.reduce(ee.Reducer.max())
    return mask
        .addBands(ee.Image(0)).select(0) // Protect against empty constraints, giving mask without bands. Mask the whole image in that case
}

const toConstraintMask = ({eeImageById, constraint}) => {
    const image = eeImageById[constraint.image].select(constraint.band)
    switch(constraint.operator) {
    case 'class':
        return ee.ImageCollection(
            constraint.selectedClasses.map(value => image.eq(value).rename('mask'))
        ).reduce(ee.Reducer.max())
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
module.exports = remap
