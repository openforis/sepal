import {compose} from '~/compose'

import {addOutputBand, addOutputImage} from '../panels/outputBands/outputImages'

export const updateOutputBands = ({changes, outputImages}) =>
    compose(
        outputImages,
        removeImages(changes.removedImages),
        addImages(changes.addedCalculations),
        removeImages(changes.removedCalculations),
        updateBands(changes.calculationsWithChangedBands)
    )

const addImages = addedImages =>
    outputImages => addedImages.length
        ? [
            ...addedImages.reduce(
                (outputImages, addedImage) => addOutputImage(addedImage, outputImages, true),
                outputImages
            )
        ]
        : outputImages

const removeImages = removedImages =>
    outputImages => {
        if (removedImages.length) {
            const removedIds = removedImages.map(({imageId}) => imageId)
            return outputImages
                .filter(output => !removedIds.includes(output.imageId))
        } else {
            return outputImages
        }
    }

const updateBands = updatedImages =>
    outputImages => {
        if (updatedImages.length) {
            return outputImages.map(outputImage => {
                const updatedImage = updatedImages.find(({imageId}) => imageId === outputImage.imageId)
                if (updatedImage) {
                    return compose(
                        outputImage,
                        addBand(updatedImage),
                        removeBand(updatedImage),
                        renameBand(updatedImage)
                    )
                } else {
                    return outputImage
                }
            })

        } else {
            return outputImages
        }
    }

const addBand = updatedImage =>
    outputImage =>
        updatedImage.addedBands?.length
            ? updatedImage.addedBands.reduce(
                (outputImage, addedBand) => addOutputBand(updatedImage, addedBand, [outputImage])[0],
                outputImage
            )
            : outputImage

const removeBand = updatedImage =>
    outputImage =>
        updatedImage.removedBands?.length
            ? updatedImage.removedBands.reduce(
                (outputImage, removedBand) => ({
                    ...outputImage,
                    outputBands: outputImage.outputBands.filter(({id}) => id !== removedBand.id)
                }),
                outputImage
            )
            : outputImage

const renameBand = updatedImage =>
    outputImage =>
        updatedImage.renamedBands?.length
            ? updatedImage.renamedBands.reduce(
                (outputImage, renamedBand) => ({
                    ...outputImage,
                    includedBands: updatedImage.includedBands,
                    outputBands: outputImage.outputBands.map(band =>
                        band.id === renamedBand.id
                            ? {...band, defaultOutputName: renamedBand.name, name: renamedBand.name}
                            : band
                    )
                }),
                outputImage
            )
            : outputImage
