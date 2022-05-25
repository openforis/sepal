const ee = require('sepal/ee')
const {map, of, switchMap} = require('rxjs')

const asset = ({id}, _bands) => {
    return {
        getImage$() {
            const mosaicCollection = () => {
                const collection = ee.ImageCollection(id)
                return ee.Image(
                    collection
                        .mosaic()
                        .copyProperties(collection, collection.propertyNames())
                ).clip(collection.geometry().bounds())
            }
            return ee.getAsset$(id, 0).pipe(
                map(({type}) => {
                    switch(type) {
                    case 'Image': return ee.Image(id)
                    case 'ImageCollection': return mosaicCollection()
                    default: throw Error(`Asset expected to be an Image or ImageCollection, was ${type}`)
                    }
                })
            )
        },
        getBands$() {
            return this.getImage$().pipe(
                switchMap(image =>
                    ee.getInfo$(image.bandNames(), 'asset band names')
                )
            )
        },
        getVisParams$() {
            return of({})
        },
        getGeometry$() {
            return this.getImage$().pipe(
                map(image => image.geometry())
            )
        }
    }
}

module.exports = asset
