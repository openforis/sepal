// Structured LLM-facing facts about the MOSAIC recipe, split by consumer
// purpose. Each getter returns a fresh object so consumers can mutate freely
// without corrupting the next caller.
//
// - selectionFacts: orchestrator picks a recipe TYPE (not yet a consumer here)
// - describeFacts:  describe_recipe answers questions about a chosen recipe
// - editFacts:      update_recipe edits a chosen recipe

const DESCRIPTION = 'Cloud-masked composite from optical satellites (Landsat 4-9, Sentinel-2). Per-scene corrections + per-pixel cloud/shadow/snow mask -> reduce surviving observations per pixel.'
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
            'Cloud-masked seasonal/annual composites',
            'Natural and false-color imagery',
            'Vegetation/water/burn/urban indices (NDVI, NDWI, NBR...)',
            'Baseline imagery for change detection or classification',
            'Cross-sensor calibrated LS+S2 composites'
        ],
        chooseWhen: 'Wants visible/multispectral, natural/false color, vegetation/water/burn indices, or names Landsat/Sentinel-2 optical imagery.',
        dontChooseWhen: 'Needs imagery through clouds or SAR data -> use a radar mosaic recipe. Wraps an existing Earth Engine asset -> use an asset mosaic recipe.',
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
            'Date edit: seasonStart must be in [targetDate - 1y + 1d, targetDate]. seasonEnd must be in [targetDate + 1d, targetDate + 1y].',
            'For "set target date to YYYY-MM-DD", set targetDate plus seasonStart/seasonEnd if current season dates would fall outside those windows. Default annual scan: seasonStart=YYYY-01-01, seasonEnd=(YYYY+1)-01-01, yearsBefore=0, yearsAfter=0.',
            'Source/correction dependency: selecting both Landsat and Sentinel-2 source groups requires surface reflectance (`SR`) or cross-sensor calibration (`CALIBRATE`); SR and CALIBRATE remain mutually exclusive.',
            'Scene-selection dependency: selecting both Landsat and Sentinel-2 source groups requires all-scenes selection (`ALL`); selected-scene lists only apply when scene selection is manually selected scenes (`SELECT`).',
            'Effective shape uses cloudBuffer; legacy GUI-shaped cloudBuffering is not editable recipe state.'
        ]
    }
}

module.exports = {getSelectionFacts, getDescribeFacts, getEditFacts}
