import ee from '#sepal/ee/ee'

// The median of a collection, or - where it holds no images - a fully masked image with the expected bands.
// ImageCollection.median() of an empty collection has no bands at all, so any band later selected or renamed from
// it silently disappears. The choice is made on the server; a collection with images is composited unchanged.
export const compositeOrMasked = (collection, bandNames) => ee.Image(ee.Algorithms.If(
    collection.size().gt(0),
    collection.median(),
    ee.Image.constant(bandNames.map(() => 0)).rename(bandNames).selfMask()
))
