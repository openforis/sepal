const ee = require('#sepal/ee')

const maskImage = (constraintsEntries, image) =>
    image.updateMask(
        constraintsEntries.reduce(
            (mask, constraintsEntry) => mask.and(applyConstraints(constraintsEntry, image)),
            ee.Image(1)
        )
    )

const applyConstraints = ({constraints, booleanOperator}, image) =>
    constraints.reduce(
        (mask, constraint) => booleanOperator === 'and'
            ? mask.and(applyConstraint(constraint, image))
            : mask.or(applyConstraint(constraint, image)),
        booleanOperator === 'and'
            ? ee.Image(1)
            : ee.Image(0)
    )

const applyConstraint = (constraint, image) => {
    const strategy = strategies[constraint.operator]
    if (!strategy) {
        console.error('Unsupported constraint', constraint)
        return ee.Image(1)
    } else {
        return strategy(constraint, image.select(constraint.band))
    }
}

const extract = (constraint, image) => {
    return constraint.bit
        ? bitwiseExtract({
            image,
            fromBit: constraint.fromBitInclusive ? constraint.fromBit : constraint.fromBit - 1,
            toBit: constraint.toBitInclusive ? constraint.toBit : constraint.toBit + 1,
        })
        : image
}

const bitwiseExtract = ({image, fromBit, toBit}) => {
    var maskSize = ee.Number(1).add(toBit).subtract(fromBit)
    var mask = ee.Number(1).leftShift(maskSize).subtract(1)
    return image.rightShift(fromBit).bitwiseAnd(mask)
}

const strategies = {
    'class': ({selectedClasses = []}, image) =>
        selectedClasses.reduce(
            (mask, selectedClass) => mask.or(image.eq(selectedClass)),
            ee.Image(0)
        ),
    '<': (constraint, image) => extract(constraint, image).lt(constraint.value),
    '≤': (constraint, image) => extract(constraint, image).lte(constraint.value),
    '>': (constraint, image) => extract(constraint, image).gt(constraint.value),
    '≥': (constraint, image) => extract(constraint, image).gte(constraint.value),
    '=': (constraint, image) => extract(constraint, image).eq(constraint.value),
    'range': (constraint, image) =>
        (constraint.fromInclusive
            ? extract(constraint, image).gte(constraint.from)
            : extract(constraint, image).gt(constraint.from)
        ).and(constraint.toInclusive
            ? extract(constraint, image).lte(constraint.to)
            : extract(constraint, image).lt(constraint.to)
        )
}

module.exports = {maskImage}
