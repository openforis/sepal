import {compose} from '~/compose'

export const updateCalculation = ({changes, calculations}) =>
    compose(
        calculations,
        handleRenameImages(changes.renamedImages),
        handleRenameImages(changes.renamedCalculations),
        handleUpdatedImages(changes.imagesWithChangedBands),
        handleUpdatedImages(changes.calculationsWithChangedBands)
    ).map(calculation => ({...calculation, invalid: !!calculation.invalid}))

const handleRenameImages = renamedImages =>
    calculations =>
        calculations.map(calculation => {
            const renamedImage = renamedImages.find(renamedImage =>
                calculation.usedBands.find(usedBand => usedBand.imageId === renamedImage.imageId)
            )
            return renamedImage
                ? renameImage(calculation, renamedImage)
                : calculation
        })

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

const handleUpdatedImages = updatedImages =>
    calculations =>
        calculations.map(calculation => {
            const updatedImage = updatedImages.find(updatedImage =>
                calculation.usedBands.find(usedBand => usedBand.imageId === updatedImage.imageId)
            )
            return updatedImage?.renamedBands?.length
                ? renameBands(calculation, updatedImage)
                : calculation
        })

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
