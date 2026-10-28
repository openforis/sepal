import {map, of, switchMap} from 'rxjs'

import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {bandsWithEncoding, encodingPropertyKeys} from '#sepal/recipe/output/bandEncoding'

// Encoding is read from assets only: a recipe's running image can carry properties copied from an input asset.
// toDictionary() answers {} for a missing property, so absent metadata is a successful read, not an error.

export const typedBands = image => {
    const bandTypes = image.bandTypes()
    return image.bandNames().map(name => ee.Dictionary({
        name,
        arrayDimensions: ee.PixelType(bandTypes.get(name)).dimensions()
    }))
}

// The bands of the image a recipe builds when asked for nothing, with their dimensionality. A producer that can
// establish them more cheaply offers getSchemaImage$(); otherwise the image itself is read. A failed schema read is
// a failure, never a reason to build the image instead.
export const imageBandEvidence$ = recipe => {
    const producer = ImageFactory(recipe)
    const image$ = producer.getSchemaImage$ ? producer.getSchemaImage$() : producer.getImage$()
    return image$.pipe(
        switchMap(image => ee.getInfo$(typedBands(image), 'image band evidence'))
    )
}

// An asset's bands, each with the encoding its metadata states for it.
export const assetBandEvidence$ = id =>
    assetEvidence$(id).pipe(
        map(({bands, encodingProperties}) => bandsWithEncoding(bands, encodingProperties))
    )

// An asset's bands and the properties its encoding may occupy, in one evaluation. A collection's bands are its
// first image's: an assumption that its members share one schema, not a scan of them, and never a mosaic of the
// collection, which for a large one exceeds Earth Engine's memory. Its encoding is the collection's own metadata,
// which is where an export writes it. A collection holding no images has no schema, which is a failure rather than
// an asset without bands.
export const assetEvidence$ = id =>
    assetReading$(id).pipe(
        switchMap(({schemaImage, metadata, imageCount}) => ee.getInfo$(ee.Dictionary({
            bands: typedBands(schemaImage),
            encodingProperties: metadata.toDictionary(encodingPropertyKeys()),
            imageCount
        }), `asset band evidence (${id})`)),
        map(({bands, encodingProperties, imageCount}) => {
            if (!imageCount) {
                throw new Error(`Image collection holds no images: ${id}`)
            }
            return {bands, encodingProperties}
        })
    )

const assetReading$ = id => id.startsWith('gs://')
    ? of(imageReading(ee.Image.loadGeoTIFF(id)))
    : ee.getAsset$(id, 0).pipe(
        map(({type}) => {
            switch (type) {
                case 'Image': return imageReading(ee.Image(id))
                case 'ImageCollection': return collectionReading(ee.ImageCollection(id))
                default: throw Error(`Asset expected to be an Image or ImageCollection, was ${type}`)
            }
        })
    )

const imageReading = image => ({schemaImage: image, metadata: image, imageCount: 1})

// Merged with an empty image so first() answers for an empty collection too, which the count then refuses.
const collectionReading = collection => ({
    schemaImage: collection.merge(ee.ImageCollection([ee.Image([])])).first(),
    metadata: collection,
    imageCount: collection.limit(1).size()
})
