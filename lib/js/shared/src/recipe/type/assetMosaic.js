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

// An asset mosaic wrapping a segments asset IS that asset: the base band names a reader derives are not band
// names on it, so they must not be selected, and its date representation is a property of the asset rather
// than a value this recipe holds - the metadata under `assetDetails` is a copy taken when it was selected.
export const segmentSource = {
    segmentsAsset: model => model?.assetDetails?.assetId,
    selectableBaseBands: false
}

// An asset mosaic stands for whatever its asset holds, so it is where historical statistics would be read
// from. That it is a candidate says where to look, not that the asset carries them.
export const historicalStatsSource = {
    statsAsset: model => model?.assetDetails?.assetId
}

export default defineRecipeType({
    type: 'ASSET_MOSAIC',
    segmentSource,
    historicalStatsSource,
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
