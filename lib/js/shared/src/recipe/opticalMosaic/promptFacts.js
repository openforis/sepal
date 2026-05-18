// Structured inputs from which a recipe specialist prompt is assembled
// mechanically (DESIGN §8). Returns a fresh object each call so consumers
// can mutate freely without corrupting the next caller.

function getPromptFacts() {
    return {
        description: 'Cloud-free composite from optical satellites (LS 4-9, S2). Per-scene corrections + per-pixel cloud/shadow/snow mask -> reduce surviving obs per pixel.',
        useCases: [
            'Cloud-free seasonal/annual composites',
            'Natural and false-color imagery',
            'Vegetation/water/burn/urban indices (NDVI, NDWI, NBR...)',
            'Baseline imagery for change detection or classification',
            'Cross-sensor calibrated LS+S2 composites'
        ],
        chooseWhen: 'Wants visible/multispectral, natural/false color, or vegetation/water/burn indices, or names LS/S2. Landsat 4-9 and Sentinel-2 are built-in source enums of `sources.dataSets`.',
        dontChooseWhen: 'Needs imagery through clouds / SAR -> use RADAR_MOSAIC. Wraps an existing EE asset -> use ASSET_MOSAIC.',
        outputs: 'Optical bands (blue, green, red, nir, swir1, swir2), tasseled-cap (brightness/greenness/wetness), 17+ indices, metadata (dayOfYear, daysFromTarget). S2 adds redEdge + waterVapor; LS adds thermal + pan.'
    }
}

module.exports = {getPromptFacts}
