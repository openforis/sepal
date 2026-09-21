import ee from '#sepal/ee/ee'

// Encoding is read from assets only: a recipe's running image can carry properties copied from an input asset.
// toDictionary() answers {} for a missing property, so absent metadata is a successful read, not an error.

export const typedBands = image => {
    const bandTypes = image.bandTypes()
    return image.bandNames().map(name => ee.Dictionary({
        name,
        arrayDimensions: ee.PixelType(bandTypes.get(name)).dimensions()
    }))
}

// A collection is read through its own properties, which the reader copies onto the image it mosaics. The
// encoding may occupy several properties, and they are named up front so the whole of it still arrives in this
// one evaluation.
export const assetBandEvidence = (image, {encodingProperties}) => ee.Dictionary({
    bands: typedBands(image),
    encoding: image.toDictionary(encodingProperties)
})
