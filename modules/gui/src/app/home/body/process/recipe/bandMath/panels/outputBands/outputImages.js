// An image added to the output: all the bands it includes, where it includes one or `addAllBands` is asked, else none,
// each named apart (namedApart).
export const addOutputImage = (image, outputImages, addAllBands = false) => {
    const outputBands = image.includedBands.length === 1 || addAllBands
        ? image.includedBands.map(band => ({...band, defaultOutputName: undefined}))
        : []
    return namedApart(
        [...outputImages, {...image, outputBands}],
        ({imageIndex}) => imageIndex === outputImages.length
    )
}

// A band added to the output of an image, named apart (namedApart). An image not output is given none.
export const addOutputBand = (image, band, outputImages) => {
    const imageIndex = outputImages.findIndex(({imageId}) => imageId === image.imageId)
    if (imageIndex < 0) {
        return outputImages
    }
    return namedApart(
        outputImages.map((outputImage, index) =>
            index === imageIndex
                ? {
                    ...outputImage,
                    includedBands: image.includedBands,
                    outputBands: [...outputImage.outputBands, {...band, defaultOutputName: undefined}]
                }
                : outputImage
        ),
        at => at.imageIndex === imageIndex && at.bandIndex === outputImages[imageIndex].outputBands.length
    )
}

// The output images with no default name taking a name another output band is output under. Custom names are taken
// first, and never changed. Then, in output order, each default keeps its name where nothing before it has taken it.
// Each default left without a name is then named apart (namedApart), in output order. Where none is, the same output
// images.
export const withUniqueDefaultNames = outputImages => {
    const taken = new Set(allBands(outputImages).map(({band}) => band.outputName).filter(Boolean))
    const unnamed = new Set()
    const keep = ({band, at}) => {
        if (band.defaultOutputName && !taken.has(band.defaultOutputName)) {
            taken.add(band.defaultOutputName)
        } else {
            unnamed.add(keyOf(at))
        }
    }
    allBands(outputImages).filter(({band}) => !band.outputName).forEach(keep)
    return unnamed.size
        ? namedApart(outputImages, at => unnamed.has(keyOf(at)))
        : outputImages
}

// The output images with each band `toName` picks given the default name of a band added to the output: its band's
// name, or else that name with the lowest free suffix, `_1` up. A name is free where no other band is output under it,
// no custom name - a band being named keeps its own - takes it, and no band named before it, in output order, has been
// given it.
export const namedApart = (outputImages, toName) => {
    const bands = allBands(outputImages)
    const taken = new Set([
        ...bands.filter(({at}) => !toName(at)).map(({band}) => outputNameOf(band)),
        ...bands.map(({band}) => band.outputName).filter(Boolean)
    ])
    return outputImages.map((outputImage, imageIndex) => ({
        ...outputImage,
        outputBands: outputImage.outputBands.map((band, bandIndex) => {
            if (!toName({imageIndex, bandIndex})) {
                return band
            }
            const defaultOutputName = freeName(band.name, taken)
            taken.add(defaultOutputName)
            return {...band, defaultOutputName}
        })
    }))
}

const freeName = (name, taken, suffix = 0) => {
    const candidate = suffix ? `${name}_${suffix}` : name
    return taken.has(candidate) ? freeName(name, taken, suffix + 1) : candidate
}

const allBands = outputImages => outputImages.flatMap(({outputBands}, imageIndex) =>
    outputBands.map((band, bandIndex) => ({band, at: {imageIndex, bandIndex}}))
)

const keyOf = ({imageIndex, bandIndex}) => `${imageIndex}.${bandIndex}`

// Whether an output band was copied from a band of its image: it has the band's id, or, where a saved recipe copied it
// under an id none of the image's known bands has, the name of the band it was copied from - never the name it is output
// under. A band known by its id is never taken by name, so a band replaced by a same-named one keeps its own outputs.
export const isOutputOf = (outputBand, band, knownBandIds) =>
    outputBand.id === band.id || (!knownBandIds.includes(outputBand.id) && outputBand.name === band.name)

// The bands an output image can still be given: those its image includes now that it does not output. Never the copy of
// them the output image was saved with, which can still list a band since removed. The ids that copy knows stay known,
// so a band replaced by a same-named one is not taken for it.
export const bandsToOutput = (outputImage, image) => {
    const knownBandIds = [...(outputImage?.includedBands || []), ...(image?.includedBands || [])].map(({id}) => id)
    return (image?.includedBands || []).filter(band =>
        !(outputImage?.outputBands || []).some(outputBand => isOutputOf(outputBand, band, knownBandIds))
    )
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
