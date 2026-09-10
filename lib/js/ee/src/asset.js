import {map, of, switchMap} from 'rxjs'

import ee from '#sepal/ee/ee'

const asset = ({id}) => {
    const getImage$ = () => {
        const mosaicCollection = () => {
            const collection = ee.ImageCollection(id)
            return ee.Image(
                ee.mosaic(collection)
                    .copyProperties(collection, collection.propertyNames())
            )
        }
        
        return id.startsWith('gs://')
            ? of(ee.Image.loadGeoTIFF(id))
            : ee.getAsset$(id, 0).pipe(
                map(({type}) => {
                    switch(type) {
                        case 'Image': return ee.Image(id)
                        case 'ImageCollection': return mosaicCollection()
                        default: throw Error(`Asset expected to be an Image or ImageCollection, was ${type}`)
                    }
                })
            )
    }
    return {
        getImage$,
        getBands$() {
            return getImage$().pipe(
                switchMap(image =>
                    ee.getInfo$(image.bandNames(), 'asset band names')
                )
            )
        },
        getGeometry$() {
            return getImage$().pipe(
                map(image => image.geometry())
            )
        }
    }
}

// The properties a reader of this asset's metadata sees. A collection carries its own - that is where an
// export writes them, and they win - while one assembled elsewhere may carry them only on its images. Same
// rule as the assetMetadata job in modules/gee, which is what the GUI reads: the two have to agree, or the
// GUI and the running image describe the same asset differently.
export const assetProperties$ = id =>
    ee.getAsset$(id, 0).pipe(
        switchMap(({type, properties}) => type === 'ImageCollection'
            ? ee.getInfo$(firstImage(id).toDictionary(), `asset image properties (${id})`).pipe(
                map(imageProperties => ({...imageProperties, ...properties}))
            )
            : of(properties || {})
        )
    )

// Merged with an empty image so `first()` answers for an empty collection too.
const firstImage = id =>
    ee.ImageCollection(id).merge(ee.ImageCollection([ee.Image([])])).first()

export default asset
