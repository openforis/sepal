import {compose} from '~/compose'

export const updateCalculation = ({changes, calculations}) =>
    compose(
        calculations,
        handleRenameImages(changes.renamedImages),
        handleRenameImages(changes.renamedCalculations),
        handleUpdatedImages(changes.imagesWithChangedBands),
        handleUpdatedImages(changes.calculationsWithChangedBands)
    )

// Every renamed image a calculation reads is renamed in it, each in turn.
const handleRenameImages = renamedImages =>
    calculations =>
        calculations.map(calculation =>
            renamedImages
                .filter(renamedImage => reads(calculation, renamedImage))
                .reduce(renameImage, calculation)
        )

const reads = (calculation, image) =>
    calculation.usedBands.some(usedBand => usedBand.imageId === image.imageId)

const renameImage = (calculation, renamedImage) => {
    const usedBands = calculation.usedBands.map(usedBand => usedBand.imageId === renamedImage.imageId
        ? {...usedBand, imageName: renamedImage.name}
        : usedBand
    )

    const expression = calculation.type === 'EXPRESSION'
        ? calculation.expression.replaceAll(
        // Identify variable by
        //      Look behind. Not one of: word character, ", ', or .
        //      Look ahead. Not one of: word character, ", or '
            new RegExp(`(?<![\\w"'\\.])${renamedImage.prevName}(?![\\w"'])`, 'g'),
            renamedImage.name
        )
        : undefined
    return renamedImage
        ? {
            ...calculation,
            expression,
            usedBands
        }
        : calculation
}

// The renamed bands of every image a calculation reads are renamed in it, image by image.
const handleUpdatedImages = updatedImages =>
    calculations =>
        calculations.map(calculation =>
            updatedImages
                .filter(updatedImage => updatedImage.renamedBands?.length && reads(calculation, updatedImage))
                .reduce(renameBands, calculation)
        )

const renameBands = (calculation, updatedImage) => {
    return updatedImage.renamedBands.reduce(
        (calculation, renamedBand) => {
            const usedBands = calculation.usedBands.map(usedBand =>
                usedBand.imageId === updatedImage.imageId && usedBand.id === renamedBand.id
                    ? {...usedBand, name: renamedBand.name}
                    : usedBand
            )

            const expression = calculation.type === 'EXPRESSION'
                ? calculation.expression
                    .replaceAll(
                        new RegExp(`(?<![\\w"'\\.])${updatedImage.name}(\\[\\W*["'])${renamedBand.prevName}(["']\\W*\\])`, 'g'),
                        `${updatedImage.name}$1${renamedBand.name}$2`
                    )
                    .replaceAll(
                        new RegExp(`(?<![\\w"'\\.])${updatedImage.name}(\\W*\\.\\W*)${renamedBand.prevName}(\\b)`, 'g'),
                        `${updatedImage.name}$1${renamedBand.name}$2`
                    )
                : undefined
            return {...calculation, expression, usedBands}
        },
        calculation
    )
}
