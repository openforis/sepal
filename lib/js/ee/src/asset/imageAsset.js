import _ from 'lodash'
import {map, of, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'

import {maskImage} from './mask.js'

const imageAsset = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const getImage$ = () => {
        const asset = imageFactory({type: 'ASSET', id: model.assetDetails.assetId})
        // ASSET_BOUNDS keeps the source's own bounds, so there is no aoi to resolve.
        const geometry$ = model.aoi?.type === 'ASSET_BOUNDS'
            ? of(null)
            : toGeometry$(model.aoi)
        return geometry$.pipe(
            switchMap(geometry =>
                asset.getImage$().pipe(
                    map(mask),
                    map(select),
                    map(image => clip(image, geometry))
                )
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

    function mask(image) {
        const {mask: {constraintsEntries} = {constraintsEntries: []}} = model
    
        return constraintsEntries.length
            ? maskImage(constraintsEntries, image)
            : image
    }

    function clip(image, geometry) {
        return geometry
            ? image.clip(geometry)
            : image
    }

    function select(image) {
        return selectedBands.length
            ? image.select(selectedBands)
            : image
    }
}

export default imageAsset
