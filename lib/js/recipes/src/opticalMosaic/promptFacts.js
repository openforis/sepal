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
        outputs: 'Optical bands (blue, green, red, nir, swir1, swir2), tasseled-cap (brightness/greenness/wetness), 17+ indices, metadata (dayOfYear, daysFromTarget). S2 adds redEdge + waterVapor; LS adds thermal + pan.',
        editGuidance: [
            'Date edit: `/dates/seasonStart` must be in [targetDate - 1y + 1d, targetDate]. `/dates/seasonEnd` must be in [targetDate + 1d, targetDate + 1y].',
            'For "set target date to YYYY-MM-DD", patch targetDate plus seasonStart/seasonEnd if current season dates would fall outside those windows. Default annual scan: seasonStart=YYYY-01-01, seasonEnd=(YYYY+1)-01-01, yearsBefore=0, yearsAfter=0.',
            'Source/correction dependency: selecting both LANDSAT and SENTINEL_2 source groups requires `compositeOptions.corrections` to include CALIBRATE and not SR.',
            'Scene-selection dependency: selecting both LANDSAT and SENTINEL_2 source groups requires `sceneSelectionOptions.type=ALL`; remove `/scenes` unless sceneSelectionOptions.type is SELECT.',
            'Effective shape uses `/compositeOptions/cloudBuffer`; legacy GUI-shaped `/compositeOptions/cloudBuffering` is not an effective patch path.'
        ]
    }
}

module.exports = {getPromptFacts}
