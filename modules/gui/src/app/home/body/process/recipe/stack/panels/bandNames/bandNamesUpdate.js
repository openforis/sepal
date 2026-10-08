// The band names entry of every image, following the bands each now includes. A band keeps the name it was given, even
// one another band also has - a name is changed only where the user edits it. A band newly included takes its own name,
// suffixed where a band of any image already has it.
export const toBandNames = (images, prevBandNames) => {
    const entries = images.map(({imageId, includedBands}) => {
        const prevBands = prevBandNames?.find(({imageId: prevImageId}) => prevImageId === imageId)?.bands || []
        return {imageId, bands: includedBands.map(({id, band: name}) => ({
            id,
            originalName: name,
            outputName: prevBands.find(({id: prevId}) => prevId === id)?.outputName
        }))}
    })
    const taken = new Set(entries.flatMap(({bands}) => bands.map(({outputName}) => outputName)).filter(name => name !== undefined))
    return entries.map(entry => ({
        ...entry,
        bands: entry.bands.map(band => band.outputName === undefined
            ? {...band, outputName: unique(band.originalName, taken)}
            : band)
    }))
}

const unique = (name, taken) => {
    let candidate = name
    for (let suffix = 1; taken.has(candidate); suffix++) {
        candidate = `${name}_${suffix}`
    }
    taken.add(candidate)
    return candidate
}
