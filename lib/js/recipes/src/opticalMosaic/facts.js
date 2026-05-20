// Structured LLM-facing facts about the MOSAIC recipe, split by consumer
// purpose. Each getter returns a fresh object so consumers can mutate freely
// without corrupting the next caller.
//
// - selectionFacts: orchestrator picks a recipe TYPE (not yet a consumer here)
// - describeFacts:  describe_recipe answers questions about a chosen recipe
// - editFacts:      update_recipe plans patches against a chosen recipe

const DESCRIPTION = 'Cloud-free composite from optical satellites (LS 4-9, S2). Per-scene corrections + per-pixel cloud/shadow/snow mask -> reduce surviving obs per pixel.'
const OUTPUTS = 'Optical bands (blue, green, red, nir, swir1, swir2), tasseled-cap (brightness/greenness/wetness), 17+ indices, metadata (dayOfYear, daysFromTarget). S2 adds redEdge + waterVapor; LS adds thermal + pan.'

// describe_recipe answers band/output questions, so it must not conflate raw
// source bands with derived index outputs: an index like NDVI is a supported
// output computed from source bands, never a "missing band".
const DESCRIBE_OUTPUTS = [
    'Output bands fall in distinct categories; an output the recipe can produce is separate from whatever the map currently displays.',
    'Raw source bands (per-pixel reflectance read from the satellites): blue, green, red, nir, swir1, swir2; S2 adds redEdge1-4 + waterVapor; LS adds thermal(+thermal2) + pan.',
    'Derived index outputs (computed FROM source bands, NOT raw source bands; each available only when its required source bands exist): NDVI, NDMI, NDWI, MNDWI, NDFI, EVI, EVI2, SAVI, NBR, MVI, UI, NDBI, IBI, NBI, EBBI, BUI, KNDVI.',
    'NDVI is a derived index, not a raw source band, and is available when red+nir are present; treat such indexes as supported outputs, never as "missing bands".',
    'Other derived bands: tasseled-cap brightness/greenness/wetness (+fourth/fifth/sixth).',
    'Metadata bands: dayOfYear, daysFromTarget.',
    'Which output is rendered on the map (e.g. an NDVI preset) is GUI/map state, not part of the recipe model -- read it from map/layer tools, not from this recipe.'
].join('\n')

function getSelectionFacts() {
    return {
        description: DESCRIPTION,
        useCases: [
            'Cloud-free seasonal/annual composites',
            'Natural and false-color imagery',
            'Vegetation/water/burn/urban indices (NDVI, NDWI, NBR...)',
            'Baseline imagery for change detection or classification',
            'Cross-sensor calibrated LS+S2 composites'
        ],
        chooseWhen: 'Wants visible/multispectral, natural/false color, or vegetation/water/burn indices, or names LS/S2. Landsat 4-9 and Sentinel-2 are built-in source enums of `sources.dataSets`.',
        dontChooseWhen: 'Needs imagery through clouds / SAR -> use RADAR_MOSAIC. Wraps an existing EE asset -> use ASSET_MOSAIC.',
        outputs: OUTPUTS
    }
}

function getDescribeFacts() {
    return {
        description: DESCRIPTION,
        outputs: DESCRIBE_OUTPUTS
    }
}

function getEditFacts() {
    return {
        guidance: [
            'Date edit: `/dates/seasonStart` must be in [targetDate - 1y + 1d, targetDate]. `/dates/seasonEnd` must be in [targetDate + 1d, targetDate + 1y].',
            'For "set target date to YYYY-MM-DD", patch targetDate plus seasonStart/seasonEnd if current season dates would fall outside those windows. Default annual scan: seasonStart=YYYY-01-01, seasonEnd=(YYYY+1)-01-01, yearsBefore=0, yearsAfter=0.',
            'Source/correction dependency: selecting both LANDSAT and SENTINEL_2 source groups requires `compositeOptions.corrections` to include CALIBRATE and not SR.',
            'Scene-selection dependency: selecting both LANDSAT and SENTINEL_2 source groups requires `sceneSelectionOptions.type=ALL`; remove `/scenes` unless sceneSelectionOptions.type is SELECT.',
            'Effective shape uses `/compositeOptions/cloudBuffer`; legacy GUI-shaped `/compositeOptions/cloudBuffering` is not an effective patch path.'
        ]
    }
}

module.exports = {getSelectionFacts, getDescribeFacts, getEditFacts}
