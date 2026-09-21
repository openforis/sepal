import {defineRecipeType} from '../defineRecipeType.js'
import {withPhysicalPolicy} from '../output/physicalBands.js'
import {imageOutputProvider} from '../output/provider.js'
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

// An exported mosaic carries the configuration it was built with in its own properties.
export const opticalCollectionDefaults = {
    defaultsAsset: model => model?.assetDetails?.assetId
}

// The asset's bands, as masking, filtering, clipping and compositing leave their names and shape. Stored values
// keep their encoding where the operation yields values the asset stored or a linear combination of them: an
// image, and a collection composited by mosaic, median, mean, minimum, maximum or mode. A standard deviation does
// neither - its offset vanishes and its scale loses sign - so its encoding is not stated.
const VALUE_COMPOSITES = [undefined, 'MOSAIC', 'MEDIAN', 'MEAN', 'MIN', 'MAX', 'MODE']

const keepsEncoding = model =>
    model?.assetDetails?.type !== 'ImageCollection' || VALUE_COMPOSITES.includes(model?.composite?.type)

// A Map, because band names are data: a plain object would answer for `constructor` and `toString`.
const statedEncodings = (model, asset) => new Map(
    keepsEncoding(model)
        ? asset.output.bands
            .filter(({encoding}) => encoding !== undefined)
            .map(({name, encoding}) => [name, encoding])
        : []
)

export default defineRecipeType({
    type: 'ASSET_MOSAIC',
    segmentSource,
    historicalStatsSource,
    opticalCollectionDefaults,
    imageOutput: imageOutputProvider({
        role: PRIMARY_IMAGE,
        // Two readings, asked for before either is tested so one discovery pass finds both. The recipe's own
        // image holds the bands its filtering, masking and compositing leave; a collection is read as its first
        // image, which a recipe filtered to any other one does not provide. Encoding comes from the asset's
        // metadata alone - the running image carries the properties of what it was built from, which would state
        // the asset's values for bands this recipe may have changed.
        describe: ({recipe, observation, input}) => {
            const configured = observation()
            const asset = input()
            if (!configured || !asset) {
                return null
            }
            const encodings = statedEncodings(recipe.model, asset)
            return {
                bands: configured.bands.map(({name, dataType}) => withPhysicalPolicy({
                    name,
                    ...(dataType === undefined ? {} : {dataType}),
                    ...(encodings.has(name) ? {encoding: encodings.get(name)} : {})
                })),
                evidence: asset.evidence
            }
        }
    }),
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
