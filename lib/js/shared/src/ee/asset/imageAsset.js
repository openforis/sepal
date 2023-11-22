const ee = require('#sepal/ee')
const {map, switchMap} = require('rxjs')
const imageFactory = require('#sepal/ee/imageFactory')
const _ = require('lodash')
const {toGeometry} = require('#sepal/ee/aoi')

const imageAsset = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    // TODO: mask (if specified)
    const getImage$ = () => {
        const asset = imageFactory({type: 'ASSET', id: model.assetDetails.assetId})
        return asset.getImage$().pipe(
            map(image => {
                return model.aoi.type === 'ASSET_BOUNDS'
                    ? image
                    : image.clip(toGeometry(model.aoi))
            },
            map(image => selectedBands.length ? image.select(image) : image)
            )
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

module.exports = imageAsset
