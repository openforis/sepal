// MOSAIC v1 handle catalog — the single deterministic handle <-> internal path
// mapping consumed by the picker catalog, prepare lookup, validation feedback,
// and update_recipe_values mapping. Handles are short lower-camel semantic
// identifiers; one handle per atomic settable value. Config arrays
// (cloudMethods, filters, corrections) are whole-array handles; datasets is
// the whole source-membership object.

const HANDLES = [
    // --- source + render speed ---
    {
        name: 'datasets',
        path: '/sources/dataSets',
        description: 'Source-group membership: which satellite groups feed the mosaic (LANDSAT, SENTINEL_2) and the dataset codes inside each group.',
        valueGuidance: 'Whole object replacement. Keys are source groups; values are arrays of dataset codes. Examples: {LANDSAT: ["LANDSAT_9", "LANDSAT_8"]}; {LANDSAT: ["LANDSAT_9"], SENTINEL_2: ["SENTINEL_2"]}.',
        allowedKeys: {
            LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM', 'LANDSAT_9_T2', 'LANDSAT_8_T2', 'LANDSAT_7_T2', 'LANDSAT_TM_T2'],
            SENTINEL_2: ['SENTINEL_2']
        }
    },
    {
        name: 'sceneCloudLimit',
        path: '/sources/cloudPercentageThreshold',
        description: 'Scene-level cloud filter applied to candidate scenes; integer percentage 0-100. Lower values admit fewer cloudy scenes.',
        valueGuidance: 'Integer 0-100; 75 is the GUI default. Tighter values reduce candidate scene volume but may starve coverage.',
        range: {min: 0, max: 100}
    },
    {
        name: 'corrections',
        path: '/compositeOptions/corrections',
        description: 'Radiometric corrections applied per scene before compositing.',
        valueGuidance: 'Whole-array replacement. Combine SR (surface reflectance), BRDF (view-angle correction), CALIBRATE (cross-sensor calibration). SR and CALIBRATE are mutually exclusive; CALIBRATE is required when both Landsat and Sentinel-2 source groups are selected.',
        allowedItems: ['SR', 'BRDF', 'CALIBRATE']
    },
    {
        name: 'sceneSelection',
        path: '/sceneSelectionOptions/type',
        description: 'Whether all matching scenes form the candidate pool (ALL) or only manually picked scenes (SELECT).',
        valueGuidance: 'ALL is required when both Landsat and Sentinel-2 source groups are selected. SELECT uses user-picked scenes per scene-area.',
        allowedValues: ['ALL', 'SELECT']
    },
    {
        name: 'filters',
        path: '/compositeOptions/filters',
        description: 'Optional collection-level percentile filters applied to the scene collection (shadow, haze, NDVI, day-of-year). Whole-array handle.',
        valueGuidance: 'Whole-array replacement. Each item is {type, percentile}. Each active filter (percentile > 0) adds a collection-level reduction and masking pass — costly. Empty array is the cheapest default.',
        allowedItems: [
            {type: 'SHADOW', percentileRange: {min: 0, max: 100}},
            {type: 'HAZE', percentileRange: {min: 0, max: 100}},
            {type: 'NDVI', percentileRange: {min: 0, max: 100}},
            {type: 'DAY_OF_YEAR', percentileRange: {min: 0, max: 100}}
        ]
    },
    {
        name: 'compose',
        path: '/compositeOptions/compose',
        description: 'Reducer used to compose surviving per-pixel observations into the output mosaic.',
        valueGuidance: 'MEDOID preserves a real multi-band observation but adds collection reduction work; MEDIAN is cheaper per pixel.',
        allowedValues: ['MEDOID', 'MEDIAN']
    },
    {
        name: 'tileOverlap',
        path: '/compositeOptions/tileOverlap',
        description: 'How duplicate Sentinel-2 observations on tile overlaps are handled before compositing.',
        valueGuidance: 'KEEP carries duplicate observations (highest memory). QUICK_REMOVE clips overlaps early — the usual memory-saver default. REMOVE adds an extra cleanup pass and rarely beats QUICK_REMOVE.',
        allowedValues: ['KEEP', 'QUICK_REMOVE', 'REMOVE']
    },
    {
        name: 'orbitOverlap',
        path: '/compositeOptions/orbitOverlap',
        description: 'How overlapping Sentinel-2 orbit observations are handled before compositing.',
        valueGuidance: 'KEEP avoids overlap-removal work. REMOVE can reduce observation volume but adds preprocessing; net win is workload-dependent.',
        allowedValues: ['KEEP', 'REMOVE']
    },

    // --- cloud masking ---
    {
        name: 'cloudMethods',
        path: '/compositeOptions/includedCloudMasking',
        description: 'Cloud-mask methods combined per image. Source-conditional: landsatCFMask needs Landsat; sentinel2CloudScorePlus and sentinel2CloudProbability need Sentinel-2; pino26 needs Sentinel-2 only and no SR correction.',
        valueGuidance: 'Whole-array replacement. Methods are combined inside one per-image cloud band; method count is not itself a primary speed lever. Each method may require companion handles (e.g. sentinel2CloudProbability needs s2CloudProbabilityMax).',
        allowedItems: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus', 'sentinel2CloudProbability', 'pino26']
    },
    {
        name: 'sepalCloudScoreMax',
        path: '/compositeOptions/sepalCloudScoreMaxCloudProbability',
        description: 'SEPAL Cloud Score maximum-cloud-probability threshold; integer 0-100. Lower is stricter masking.',
        valueGuidance: 'GUI moderate=30, aggressive=25. Very low values (e.g. 5) are extreme and may remove too many pixels.',
        range: {min: 0, max: 100}
    },
    {
        name: 's2CloudScoreBand',
        path: '/compositeOptions/sentinel2CloudScorePlusBand',
        description: 'Sentinel-2 Cloud Score+ band: cs (instantaneous) or cs_cdf (temporal rank).',
        valueGuidance: 'GUI moderate uses cs_cdf; aggressive uses cs.',
        allowedValues: ['cs', 'cs_cdf']
    },
    {
        name: 's2CloudScoreMax',
        path: '/compositeOptions/sentinel2CloudScorePlusMaxCloudProbability',
        description: 'Sentinel-2 Cloud Score+ maximum-cloud-probability threshold; integer 0-100. Lower is stricter masking.',
        valueGuidance: 'GUI moderate=45, aggressive=35.',
        range: {min: 0, max: 100}
    },
    {
        name: 's2CloudProbabilityMax',
        path: '/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability',
        description: 'Sentinel-2 Cloud Probability maximum-cloud-probability threshold; integer 0-100. Lower is stricter masking.',
        valueGuidance: 'Required whenever cloudMethods includes sentinel2CloudProbability.',
        range: {min: 0, max: 100}
    },
    {
        name: 'landsatCloudMask',
        path: '/compositeOptions/landsatCFMaskCloudMasking',
        description: 'Landsat CFMask cloud masking strength.',
        valueGuidance: 'OFF disables Landsat cloud masking. MODERATE / AGGRESSIVE move cloud, shadow, and cirrus strengths together in the GUI presets.',
        allowedValues: ['OFF', 'MODERATE', 'AGGRESSIVE']
    },
    {
        name: 'landsatShadowMask',
        path: '/compositeOptions/landsatCFMaskCloudShadowMasking',
        description: 'Landsat CFMask cloud-shadow masking strength.',
        valueGuidance: 'Usually mirrors landsatCloudMask in the GUI presets.',
        allowedValues: ['OFF', 'MODERATE', 'AGGRESSIVE']
    },
    {
        name: 'landsatCirrusMask',
        path: '/compositeOptions/landsatCFMaskCirrusMasking',
        description: 'Landsat CFMask cirrus masking strength.',
        valueGuidance: 'Usually mirrors landsatCloudMask in the GUI presets.',
        allowedValues: ['OFF', 'MODERATE', 'AGGRESSIVE']
    },
    {
        name: 'landsatDilatedCloud',
        path: '/compositeOptions/landsatCFMaskDilatedCloud',
        description: 'Whether to remove Landsat dilated-cloud pixels.',
        valueGuidance: 'REMOVE is the GUI default and is consistent with stricter Landsat masking.',
        allowedValues: ['KEEP', 'REMOVE']
    },
    {
        name: 'snowMasking',
        path: '/compositeOptions/snowMasking',
        description: 'Whether snow/ice pixels are masked during per-pixel masking.',
        valueGuidance: 'Keep ON by default even outside snowy regions: clouds can be misclassified as snow.',
        allowedValues: ['ON', 'OFF']
    },
    {
        name: 'holes',
        path: '/compositeOptions/holes',
        description: 'Whether fully-masked pixels may remain empty (ALLOW) or are backfilled (PREVENT).',
        valueGuidance: 'ALLOW is normal. PREVENT is a fallback when masking removes bright surfaces like built-up areas or deserts.',
        allowedValues: ['PREVENT', 'ALLOW']
    },
    {
        name: 'cloudBuffer',
        path: '/compositeOptions/cloudBuffer',
        description: 'Spatial buffer distance around detected cloud pixels, in meters.',
        valueGuidance: '0 is fastest and most reliable. 120/600 add an expensive per-image distance-transform pass — reserve for explicit cloud-edge artifacts, not generic residual-cloud requests.',
        allowedValues: [0, 120, 600]
    },

    // --- BRDF + date basics ---
    {
        name: 'brdfMultiplier',
        path: '/compositeOptions/brdfMultiplier',
        description: 'BRDF correction strength multiplier; only relevant when corrections include BRDF.',
        valueGuidance: 'Number greater than 0. GUI default is 4.',
        range: {min: 0, exclusiveMin: true}
    },
    {
        name: 'targetDate',
        path: '/dates/targetDate',
        description: 'Central date for the yearly mosaic window (YYYY-MM-DD).',
        valueGuidance: 'Must be on or after 1982-08-22 (Landsat 4 launch). Changing it usually requires moving seasonStart and seasonEnd into the new window.',
        format: 'YYYY-MM-DD'
    },
    {
        name: 'seasonStart',
        path: '/dates/seasonStart',
        description: 'Season-window start date tied to targetDate (YYYY-MM-DD).',
        valueGuidance: 'Must be in [targetDate - 1 year + 1 day, targetDate].',
        format: 'YYYY-MM-DD'
    },
    {
        name: 'seasonEnd',
        path: '/dates/seasonEnd',
        description: 'Season-window end date tied to targetDate (YYYY-MM-DD).',
        valueGuidance: 'Must be in [targetDate + 1 day, targetDate + 1 year].',
        format: 'YYYY-MM-DD'
    },
    {
        name: 'yearsBefore',
        path: '/dates/yearsBefore',
        description: 'Extra previous years included in the candidate scene pool. Integer 0-25.',
        valueGuidance: 'Larger values widen the candidate pool — higher memory/latency. 0 is the GUI default.',
        range: {min: 0, max: 25}
    },
    {
        name: 'yearsAfter',
        path: '/dates/yearsAfter',
        description: 'Extra following years included in the candidate scene pool. Integer 0-25.',
        valueGuidance: 'Larger values widen the candidate pool — higher memory/latency. 0 is the GUI default.',
        range: {min: 0, max: 25}
    }
]

function getHandles() {
    return HANDLES.map(handle => structuredClone(handle))
}

module.exports = {getHandles}
