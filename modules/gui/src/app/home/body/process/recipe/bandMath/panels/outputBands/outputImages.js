export const addOutputImage = (image, outputImages, addAllBands = false) => {
    const toOutputBand = band =>
        ({...band, defaultOutputName: createUniqueBandName(image, band, outputImages)})

    const toOutputBands = () => image.includedBands.map(toOutputBand)
    return [
        ...(outputImages),
        {
            ...image,
            outputBands: image.includedBands.length === 1
                ? toOutputBands()
                : addAllBands
                    ? toOutputBands()
                    : []
        }
    ]
}

export const addOutputBand = (image, band, outputImages) => {
    const defaultOutputName = createUniqueBandName(image, band, outputImages)
    return outputImages.map(outputImage =>
        outputImage.imageId === image.imageId
            ? {
                ...outputImage,
                includedBands: image.includedBands,
                outputBands: [...outputImage.outputBands, {...band, defaultOutputName}]
            }
            : outputImage
    )
}

export const createUniqueBandName = (image, band, outputImages) => {
    const otherOutputNames = outputImages
        .map(({imageId, outputBands}) =>
            outputBands
                .filter(({id}) => imageId !== image.imageId || id !== band.id)
                .map(outputNameOf)
        )
        .flat()

    const recurseRename = (potentialName, i) =>
        otherOutputNames.includes(potentialName)
            ? recurseRename(`${band.name}_${i}`, i + 1)
            : potentialName

    return recurseRename(band.name, 1)
}

// Whether an output band was copied from a band of its image: it has the band's id, or, where a saved recipe copied it
// under an id none of the image's known bands has, the name of the band it was copied from - never the name it is output
// under. A band known by its id is never taken by name, so a band replaced by a same-named one keeps its own outputs.
export const isOutputOf = (outputBand, band, knownBandIds) =>
    outputBand.id === band.id || (!knownBandIds.includes(outputBand.id) && outputBand.name === band.name)

// Whether an output image outputs a band of its image, the bands it includes being those known.
export const outputsBand = (outputImage, band) => {
    const knownBandIds = (outputImage?.includedBands || []).map(({id}) => id)
    return (outputImage?.outputBands || []).some(outputBand => isOutputOf(outputBand, band, knownBandIds))
}

// The name a band is output under: its custom name, if given, or else its default.
export const outputNameOf = ({outputName, defaultOutputName}) =>
    outputName || defaultOutputName

// A custom name is optional; a default name is the band's own, made unique, and is not checked.
export const isValidOutputName = outputName =>
    !outputName || /^[a-zA-Z_][a-zA-Z0-9_]{0,29}$/.test(outputName)

export const isUniqueOutputName = (name, allOutputNames) =>
    allOutputNames.filter(outputName => outputName === name).length <= 1

export const allOutputNames = outputImages =>
    outputImages.flatMap(({outputBands}) => outputBands.map(outputNameOf))

export const hasValidOutputNames = outputImages =>
    outputImages.every(({outputBands}) => outputBands.every(({outputName}) => isValidOutputName(outputName)))

export const hasUniqueOutputNames = outputImages => {
    const names = allOutputNames(outputImages)
    return names.every(name => isUniqueOutputName(name, names))
}
