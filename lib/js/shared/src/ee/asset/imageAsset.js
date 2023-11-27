const ee = require('#sepal/ee')
const {map, switchMap} = require('rxjs')
const imageFactory = require('#sepal/ee/imageFactory')
const {maskImage} = require('./mask')
const _ = require('lodash')
const {toGeometry} = require('#sepal/ee/aoi')

const imageAsset = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const getImage$ = () => {
        const asset = imageFactory({type: 'ASSET', id: model.assetDetails.assetId})
        return asset.getImage$().pipe(
            map(mask),
            map(select),
            map(clip)
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

    function mask(image) {
        const {mask: {constraintsEntries} = {constraintsEntries: []}} = model
    
        return constraintsEntries.length
            ? maskImage(constraintsEntries, image)
            : image
    }

    function clip(image) {
        return model.aoi.type === 'ASSET_BOUNDS'
            ? image
            : image.clip(toGeometry(model.aoi))
    }

    function select(image) {
        return selectedBands.length
            ? image.select(selectedBands)
            : image
    }
}

module.exports = imageAsset
