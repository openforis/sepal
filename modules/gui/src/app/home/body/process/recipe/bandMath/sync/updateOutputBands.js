import {compose} from '~/compose'

import {addOutputBand, addOutputImage, isOutputOf, namedApart} from '../panels/outputBands/outputImages'

export const updateOutputBands = ({changes, outputImages}) =>
    compose(
        outputImages,
        removeImages(changes.removedImages),
        addImages(changes.addedCalculations),
        removeImages(changes.removedCalculations),
        updateBands([...changes.calculationsWithChangedBands, ...changes.imagesWithChangedBands])
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

// The bands of every changed input and calculation removed, then renamed, then added, each step over every output image,
// so a name is checked against every output and the names given before it in the same change.
const updateBands = updatedImages =>
    outputImages => updatedImages.length
        ? compose(
            outputImages,
            ...updatedImages.map(updatedImage => updateOutputImage(updatedImage, removeBand(updatedImage))),
            renameBands(updatedImages),
            ...updatedImages.map(addBands)
        )
        : outputImages

const updateOutputImage = (updatedImage, update) =>
    outputImages => outputImages.map(outputImage =>
        outputImage.imageId === updatedImage.imageId ? update(outputImage) : outputImage
    )

const addBands = updatedImage =>
    outputImages => (updatedImage.addedBands || []).reduce(
        (outputImages, addedBand) => addOutputBand(updatedImage, addedBand, outputImages),
        outputImages
    )

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

// A renamed band takes its new name, made unique among every other output's final name - custom names included - and the
// names given to bands renamed before it, in output order (namedApart). Until it is named, a renamed band's old name holds
// back no other.
const renameBands = updatedImages =>
    outputImages => {
        const renamedImages = updatedImages.filter(({renamedBands}) => renamedBands?.length)
        if (!renamedImages.length) {
            return outputImages
        }
        const unnamed = compose(
            outputImages,
            ...renamedImages.map(updatedImage => updateOutputImage(updatedImage, unnameRenamedBands(updatedImage)))
        )
        return namedApart(unnamed, ({imageIndex, bandIndex}) => {
            const {imageId, outputBands} = unnamed[imageIndex]
            const renamedImage = renamedImages.find(updatedImage => updatedImage.imageId === imageId)
            return Boolean(renamedImage?.renamedBands.some(({id}) => id === outputBands[bandIndex].id))
        })
    }

const unnameRenamedBands = updatedImage =>
    outputImage => ({
        ...outputImage,
        includedBands: updatedImage.includedBands,
        outputBands: outputImage.outputBands.map(band => {
            const renamedBand = updatedImage.renamedBands.find(({id}) => id === band.id)
            return renamedBand ? {...band, name: renamedBand.name, defaultOutputName: undefined} : band
        })
    })
