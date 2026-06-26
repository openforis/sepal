import _ from 'lodash'
import {map, switchMap} from 'rxjs'

import {toGeometry} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'

import {maskImage} from './mask.js'

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

export default imageAsset
