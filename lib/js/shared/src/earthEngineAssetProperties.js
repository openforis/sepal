// What Earth Engine keeps as asset metadata. Measured for Image and ImageCollection properties only, by
// modules/gee/verify/assetPropertyLimits.mjs; see docs/design/recipes/data-sources.md#band-encoding.
//
// A batch export accepts an oversized property and completes with it silently missing, so a write path has to
// measure before it submits.

const encoder = new TextEncoder()

export const MAX_ASSET_PROPERTY_BYTES = 16384

export const assetPropertyBytes = value => encoder.encode(String(value)).length

export const isWithinAssetPropertyLimit = value => assetPropertyBytes(value) <= MAX_ASSET_PROPERTY_BYTES
