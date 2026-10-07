import {compose} from '~/compose'

import {addOutputBand, addOutputImage, isOutputOf} from '../panels/outputBands/outputImages'

export const updateOutputBands = ({changes, outputImages}) =>
    compose(
        outputImages,
        removeImages(changes.removedImages),
        addImages(changes.addedCalculations),
        removeImages(changes.removedCalculations),
        updateBands(changes.calculationsWithChangedBands),
        updateBands(changes.imagesWithChangedBands)
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
                return updatedImage
                    ? compose(
                        outputImage,
                        addBand(updatedImage),
                        removeBand(updatedImage),
                        renameBand(updatedImage)
                    )
                    : outputImage
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

// A removed band takes every output copied from it. The known bands are those still selected, the ones just added
// included, and the removed ones themselves: none of them is taken by another's name.
const removeBand = updatedImage =>
    outputImage => {
        if (!updatedImage.removedBands?.length) {
            return outputImage
        }
        const knownBandIds = [...updatedImage.includedBands, ...updatedImage.removedBands].map(({id}) => id)
        return updatedImage.removedBands.reduce(
            (outputImage, removedBand) => ({
                ...outputImage,
                outputBands: outputImage.outputBands.filter(outputBand => !isOutputOf(outputBand, removedBand, knownBandIds))
            }),
            outputImage
        )
    }

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
