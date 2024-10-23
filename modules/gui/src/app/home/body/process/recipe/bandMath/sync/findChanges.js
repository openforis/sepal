export const findChanges = ({prevImages, images, prevCalculations, calculations}) => {
    const imageTuples = toImageTuples(prevImages, images)
    const calculationTuples = toImageTuples(prevCalculations, calculations)
    return {
        removedImages: findMissingImages(prevImages, images),
        renamedImages: findRenamedImages(imageTuples),
        addedCalculations: findMissingImages(calculations, prevCalculations),
        removedCalculations: findMissingImages(prevCalculations, calculations),
        renamedCalculations: findRenamedImages(calculationTuples),
        imagesWithChangedBands: findImagesWithChangedBands(imageTuples),
        calculationsWithChangedBands: findImagesWithChangedBands(calculationTuples),
    }
}

function findImagesWithChangedBands(tuples) {
    return tuples
        .map(([prevImage, image]) => ({...image,
            addedBands: findMissingBands(image.includedBands, prevImage.includedBands),
            removedBands: findMissingBands(prevImage.includedBands, image.includedBands),
            renamedBands: findRenamedBands(prevImage.includedBands, image.includedBands)
        }))
        .filter(changes =>
            ['addedBands', 'removedBands', 'renamedBands'].find(changeType => changes[changeType].length)
        )
}

function findRenamedBands(prevBands, bands) {
    return prevBands
        .map(prevBand => ([
            prevBand,
            bands.find(band => prevBand.id === band.id)
        ]))
        .filter(([prevBand, band]) => prevBand && band && prevBand.name !== band.name)
        .map(([prevBand, band]) => ({
            ...band,
            prevName: prevBand.name
        }))
}

function findMissingBands(bands1, bands2) {
    return bands1.filter(({id: id1}) =>
        !bands2.find(({id: id2}) => id1 === id2)
    )
}

function findMissingImages(images1, images2) {
    return images1.filter(({imageId: imageId1}) =>
        !images2.find(({imageId: imageId2}) =>
            imageId1 === imageId2
        )
    )
}

function toImageTuples(images1, images2) {
    return images1
        .map(image1 => ([
            image1,
            images2.find(({imageId: imageId2}) => image1.imageId === imageId2
            )
        ]))
        .filter(([image1, image2]) => image1 && image2)
}

function findRenamedImages(tuples) {
    return tuples
        .filter(([fromImage, toImage]) => fromImage.name !== toImage.name)
        .map(([fromImage, toImage]) => ({...toImage, prevName: fromImage?.name}))
}
