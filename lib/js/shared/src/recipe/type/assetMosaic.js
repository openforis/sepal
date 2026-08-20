import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'
import {fromId} from '../source/extract.js'
import {assetReference} from '../source/reference.js'

// An Asset Mosaic is one Earth Engine asset, clipped to an AOI (lib/js/ee/src/asset/imageAsset.js). The
// asset is a bare id under `model.assetDetails`, which also carries the band list, visualizations and
// metadata copied off it when it was selected.
//
// The asset is required, but only once the section exists: a recipe with no assetDetails yet has simply not
// been configured, while an assetDetails that has been written to without an assetId is broken.

export const PRIMARY_IMAGE = 'PRIMARY_IMAGE'

export default defineRecipeType({
    type: 'ASSET_MOSAIC',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromId({
            model,
            keys: ['assetDetails', 'assetId'],
            toReference: assetReference,
            role: PRIMARY_IMAGE,
            requiredWhenPresent: true
        })
    ]
})
