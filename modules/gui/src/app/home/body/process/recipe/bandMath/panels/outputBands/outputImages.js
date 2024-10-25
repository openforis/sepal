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
                .map(({defaultOutputName, outputName}) => outputName || defaultOutputName)
        )
        .flat()

    const recurseRename = (potentialName, i) =>
        otherOutputNames.includes(potentialName)
            ? recurseRename(`${band.name}_${i}`, ++i)
            : potentialName

    return recurseRename(band.name, 1)
}
