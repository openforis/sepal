export const toBandNames = (images, prevBandNames) => {
    const imagesWithNames = images
        .map(({imageId, includedBands}) => {
            const prevImageBandName = prevBandNames && prevBandNames
                .find(({imageId: prevImageId}) => prevImageId === imageId)
            return {imageId, bands: includedBands.map(({id, band: name}) => {
                const prevOutputName = prevImageBandName && prevImageBandName.bands
                    .find(({id: prevId}) => prevId === id)?.outputName
                return ({id, originalName: name, outputName: prevOutputName || name})
            })}
        })

    const renameDuplicate = (name, updatedImagesWithNames) => {
        const isDuplicate = name => !!updatedImagesWithNames
            .filter(({bands}) => bands.find(({outputName: n}) => name === n))
            .length

        const recurseRename = (potentialName, i) => {
            return isDuplicate(potentialName)
                ? recurseRename(`${name}_${i}`, ++i)
                : potentialName
        }

        return recurseRename(name, 1)
    }
    return imagesWithNames
        .reduce(
            (acc, image) => ([
                ...acc,
                {
                    ...image,
                    bands: image.bands.map(band => ({
                        ...band,
                        originalName: band.originalName,
                        outputName: renameDuplicate(band.outputName, acc)
                    }))
                }
            ]),
            []
        )
}
