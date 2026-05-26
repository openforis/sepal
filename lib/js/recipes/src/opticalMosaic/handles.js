// MOSAIC v1 handle catalog — the single deterministic handle <-> internal path
// mapping consumed by the picker catalog, prepare lookup, validation feedback,
// and update_recipe_values mapping. Handles carry user-facing labels and
// (where useful) value-label maps, summary guidance, and performance notes
// so prompt + summary surfaces can read user-language strings directly.

const HANDLES = [
    {
        name: 'aoi',
        path: '/aoi',
        label: 'Area of interest',
        description: 'Geographic region the mosaic covers. Whole-object handle. Must be supplied — no sensible default.',
        userRequired: true,
        valueGuidance: 'Whole-object replacement. Set ONLY from a real AOI object supplied by context (prepared packet currentValue, GUI selection, or a clarification answer). Do NOT geocode place names. Do NOT invent polygon coordinates. If the user only describes an area textually and no AOI object is available, ask ONE clarification question (e.g. "What area should this mosaic cover? Send me a polygon or pick a country/region.").',
        summaryGuidance: 'Name the area in plain terms (e.g. "the polygon you supplied", "Kenya").',
        allowedItems: [
            {value: 'POLYGON', label: 'Polygon ring', shape: {type: 'POLYGON', path: 'array of [lng,lat] pairs, at least 3 points'}},
            {value: 'EE_TABLE', label: 'Earth Engine feature table', shape: {type: 'EE_TABLE', id: 'GEE asset id (e.g. FAO/GAUL/2015/level0)', keyColumn: 'string', key: 'string or number', level: 'optional'}}
        ],
        examples: [
            {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1], [36.7, -1.4]]},
            {type: 'EE_TABLE', id: 'FAO/GAUL/2015/level0', keyColumn: 'ADM0_NAME', key: 'Kenya'}
        ]
    },
    {
        name: 'datasets',
        path: '/sources/dataSets',
        label: 'Source datasets',
        description: 'Source-group membership: which satellite groups feed the mosaic (LANDSAT, SENTINEL_2) and the dataset codes inside each group.',
        valueGuidance: 'Whole object replacement. Keys are source groups; values are arrays of dataset codes.',
        summaryGuidance: 'Talk about which satellites the mosaic uses (e.g. "now uses Landsat only").',
        performanceNote: 'More source groups + datasets widen the candidate scene pool; memory/latency scale with that.',
        allowedKeys: {
            LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM', 'LANDSAT_9_T2', 'LANDSAT_8_T2', 'LANDSAT_7_T2', 'LANDSAT_TM_T2'],
            SENTINEL_2: ['SENTINEL_2']
        },
        valueLabels: {
            LANDSAT: 'Landsat',
            SENTINEL_2: 'Sentinel-2',
            LANDSAT_9: 'Landsat 9', LANDSAT_8: 'Landsat 8', LANDSAT_7: 'Landsat 7', LANDSAT_TM: 'Landsat 4-5',
            LANDSAT_9_T2: 'Landsat 9 Tier 2', LANDSAT_8_T2: 'Landsat 8 Tier 2', LANDSAT_7_T2: 'Landsat 7 Tier 2', LANDSAT_TM_T2: 'Landsat 4-5 Tier 2'
        },
        examples: [
            {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']},
            {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}
        ],
        couplings: [
            {
                when: {handle: 'datasets', missingKey: 'SENTINEL_2'},
                expands: ['cloudMethods'],
                guidance: 'Without Sentinel-2 in datasets, Sentinel-2-only cloud methods (sentinel2CloudScorePlus, sentinel2CloudProbability, pino26) are invalid — drop them from cloudMethods.'
            },
            {
                when: {handle: 'datasets', missingKey: 'LANDSAT'},
                expands: ['cloudMethods'],
                guidance: 'Without Landsat in datasets, Landsat CFMask is invalid — drop it from cloudMethods.'
            }
        ]
    },
    {
        name: 'sceneCloudLimit',
        path: '/sources/cloudPercentageThreshold',
        label: 'Scene-level cloud limit',
        description: 'Scene-level cloud filter applied to candidate scenes; integer percentage 0-100. Lower values admit fewer cloudy scenes.',
        valueGuidance: 'Integer 0-100; 75 is the GUI default. Tighter values reduce candidate scene volume but may starve coverage.',
        summaryGuidance: 'Talk about cloudier-vs-cleaner candidate scenes (e.g. "skip scenes more than X% cloudy").',
        performanceNote: 'Lower limits reduce candidate scenes — directly reduces memory/latency.',
        range: {min: 0, max: 100},
        examples: [50, 75, 90]
    },
    {
        name: 'corrections',
        path: '/compositeOptions/corrections',
        label: 'Radiometric corrections',
        description: 'Radiometric corrections applied per scene before compositing.',
        valueGuidance: 'Whole-array replacement. Combine SR (surface reflectance), BRDF (view-angle correction), CALIBRATE (cross-sensor calibration). SR and CALIBRATE are mutually exclusive; CALIBRATE is required when both Landsat and Sentinel-2 source groups are selected.',
        summaryGuidance: 'Talk about which corrections are applied per scene, in user terms (e.g. "now uses surface reflectance without BRDF").',
        performanceNote: 'BRDF and cross-sensor calibration are compute/memory-heavy, especially on Sentinel-2.',
        allowedItems: ['SR', 'BRDF', 'CALIBRATE'],
        valueLabels: {SR: 'surface reflectance', BRDF: 'BRDF correction', CALIBRATE: 'cross-sensor calibration'},
        examples: [['SR'], ['SR', 'BRDF'], ['CALIBRATE', 'BRDF']]
    },
    {
        name: 'sceneSelection',
        path: '/sceneSelectionOptions/type',
        label: 'Scene selection',
        description: 'Whether all matching scenes form the candidate pool (ALL) or only manually picked scenes (SELECT).',
        valueGuidance: 'ALL is required when both Landsat and Sentinel-2 source groups are selected. SELECT uses user-picked scenes per scene-area.',
        allowedValues: ['ALL', 'SELECT'],
        valueLabels: {ALL: 'all matching scenes', SELECT: 'manually selected scenes'}
    },
    {
        name: 'filters',
        path: '/compositeOptions/filters',
        label: 'Scene filters',
        description: 'Optional collection-level percentile filters applied to the scene collection (shadow, haze, NDVI, day-of-year). Whole-array handle.',
        valueGuidance: 'Whole-array replacement. Each item is {type, percentile}. Each active filter (percentile > 0) adds a collection-level reduction and masking pass — costly. Empty array is the cheapest default.',
        summaryGuidance: 'Talk about which scene filters are active in plain terms (e.g. "removed the haze filter").',
        performanceNote: 'Each active filter adds a collection-level reduction + masking pass; one of the costliest knobs.',
        allowedItems: [
            {type: 'SHADOW', percentileRange: {min: 0, max: 100}},
            {type: 'HAZE', percentileRange: {min: 0, max: 100}},
            {type: 'NDVI', percentileRange: {min: 0, max: 100}},
            {type: 'DAY_OF_YEAR', percentileRange: {min: 0, max: 100}}
        ],
        valueLabels: {SHADOW: 'shadow filter', HAZE: 'haze filter', NDVI: 'NDVI filter', DAY_OF_YEAR: 'day-of-year filter'},
        examples: [[], [{type: 'SHADOW', percentile: 20}]]
    },
    {
        name: 'compose',
        path: '/compositeOptions/compose',
        label: 'Compositing reducer',
        description: 'Reducer used to compose surviving per-pixel observations into the output mosaic.',
        valueGuidance: 'MEDOID preserves a real multi-band observation but adds collection reduction work; MEDIAN is cheaper per pixel.',
        summaryGuidance: 'Talk about how surviving observations are combined per pixel.',
        performanceNote: 'Medoid adds a per-pixel collection reduction; median is cheaper.',
        allowedValues: ['MEDOID', 'MEDIAN'],
        valueLabels: {MEDOID: 'medoid', MEDIAN: 'median'}
    },
    {
        name: 'tileOverlap',
        path: '/compositeOptions/tileOverlap',
        label: 'Sentinel-2 tile overlap',
        description: 'How duplicate Sentinel-2 observations on tile overlaps are handled before compositing.',
        valueGuidance: 'KEEP carries duplicate observations (highest memory). QUICK_REMOVE clips overlaps early — the usual memory-saver default. REMOVE adds an extra cleanup pass and rarely beats QUICK_REMOVE.',
        performanceNote: 'KEEP carries duplicate observations downstream; QUICK_REMOVE/REMOVE reduce that volume.',
        allowedValues: ['KEEP', 'QUICK_REMOVE', 'REMOVE'],
        valueLabels: {KEEP: 'keep overlap', QUICK_REMOVE: 'quickly remove overlap', REMOVE: 'fully remove overlap'}
    },
    {
        name: 'orbitOverlap',
        path: '/compositeOptions/orbitOverlap',
        label: 'Sentinel-2 orbit overlap',
        description: 'How overlapping Sentinel-2 orbit observations are handled before compositing.',
        valueGuidance: 'KEEP avoids overlap-removal work. REMOVE can reduce observation volume but adds preprocessing; net win is workload-dependent.',
        performanceNote: 'REMOVE trades preprocessing cost for fewer downstream observations.',
        allowedValues: ['KEEP', 'REMOVE'],
        valueLabels: {KEEP: 'keep overlap', REMOVE: 'remove overlap'}
    },

    {
        name: 'cloudMethods',
        path: '/compositeOptions/includedCloudMasking',
        label: 'Cloud-masking methods',
        description: 'Cloud-mask methods combined per image. Source-conditional: each item declares which source groups it applies to.',
        valueGuidance: 'Whole-array replacement. Removing all methods disables cloud masking and usually leaves more clouds. For requests like "too cloudy", residual clouds, or cloudy images, preserve compatible applicable methods and tighten their companion thresholds/modes using aggressive profiles. Only set an empty array when the user explicitly asks to disable cloud masking.',
        summaryGuidance: 'Name the user-facing cloud-mask method labels (e.g. "SEPAL Cloud Score and Landsat CFMask").',
        allowedItems: [
            {
                value: 'sepalCloudScore',
                label: 'SEPAL Cloud Score',
                appliesTo: ['LANDSAT', 'SENTINEL_2'],
                companionHandles: ['sepalCloudScoreMax'],
                profiles: {
                    moderate: {sepalCloudScoreMax: 30},
                    aggressive: {sepalCloudScoreMax: 25}
                }
            },
            {
                value: 'landsatCFMask',
                label: 'Landsat CFMask',
                appliesTo: ['LANDSAT'],
                alternativeGroup: 'landsatCloudMask',
                companionHandles: ['landsatCloudMask', 'landsatShadowMask', 'landsatCirrusMask', 'landsatDilatedCloud'],
                profiles: {
                    moderate: {landsatCloudMask: 'MODERATE', landsatShadowMask: 'MODERATE', landsatCirrusMask: 'MODERATE', landsatDilatedCloud: 'REMOVE'},
                    aggressive: {landsatCloudMask: 'AGGRESSIVE', landsatShadowMask: 'AGGRESSIVE', landsatCirrusMask: 'AGGRESSIVE', landsatDilatedCloud: 'REMOVE'}
                }
            },
            {
                value: 'sentinel2CloudScorePlus',
                label: 'Sentinel-2 Cloud Score+',
                appliesTo: ['SENTINEL_2'],
                alternativeGroup: 'sentinel2CloudMask',
                companionHandles: ['s2CloudScoreBand', 's2CloudScoreMax'],
                profiles: {
                    moderate: {s2CloudScoreBand: 'cs_cdf', s2CloudScoreMax: 45},
                    aggressive: {s2CloudScoreBand: 'cs', s2CloudScoreMax: 35}
                }
            },
            {
                value: 'sentinel2CloudProbability',
                label: 'Sentinel-2 Cloud Probability',
                appliesTo: ['SENTINEL_2'],
                alternativeGroup: 'sentinel2CloudMask',
                companionHandles: ['s2CloudProbabilityMax'],
                profiles: {
                    moderate: {s2CloudProbabilityMax: 40},
                    aggressive: {s2CloudProbabilityMax: 30}
                }
            },
            {
                value: 'pino26',
                label: 'PINO26',
                appliesTo: ['SENTINEL_2'],
                alternativeGroup: 'sentinel2CloudMask',
                applicabilityNote: 'Sentinel-2 only and incompatible with surface-reflectance (SR) correction.'
            }
        ],
        examples: [
            ['sepalCloudScore', 'landsatCFMask'],
            ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus']
        ]
    },
    {
        name: 'sepalCloudScoreMax',
        path: '/compositeOptions/sepalCloudScoreMaxCloudProbability',
        label: 'SEPAL Cloud Score threshold',
        description: 'SEPAL Cloud Score maximum-cloud-probability threshold; integer 0-100. Lower is stricter masking.',
        valueGuidance: 'GUI moderate=30, aggressive=25. Very low values (e.g. 5) are extreme and may remove too many pixels.',
        summaryGuidance: 'Lower = stricter cloud filtering.',
        range: {min: 0, max: 100},
        examples: [30, 25]
    },
    {
        name: 's2CloudScoreBand',
        path: '/compositeOptions/sentinel2CloudScorePlusBand',
        label: 'Sentinel-2 Cloud Score+ band',
        description: 'Sentinel-2 Cloud Score+ band: cs (instantaneous) or cs_cdf (temporal rank).',
        valueGuidance: 'GUI moderate uses cs_cdf; aggressive uses cs.',
        allowedValues: ['cs', 'cs_cdf'],
        valueLabels: {cs: 'instantaneous Cloud Score', cs_cdf: 'temporal-rank Cloud Score'}
    },
    {
        name: 's2CloudScoreMax',
        path: '/compositeOptions/sentinel2CloudScorePlusMaxCloudProbability',
        label: 'Sentinel-2 Cloud Score+ threshold',
        description: 'Sentinel-2 Cloud Score+ maximum-cloud-probability threshold; integer 0-100. Lower is stricter masking.',
        valueGuidance: 'GUI moderate=45, aggressive=35.',
        summaryGuidance: 'Lower = stricter cloud filtering.',
        range: {min: 0, max: 100},
        examples: [45, 35]
    },
    {
        name: 's2CloudProbabilityMax',
        path: '/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability',
        label: 'Sentinel-2 Cloud Probability threshold',
        description: 'Sentinel-2 Cloud Probability maximum-cloud-probability threshold; integer 0-100. Lower is stricter masking.',
        valueGuidance: 'Required whenever cloudMethods includes sentinel2CloudProbability.',
        summaryGuidance: 'Lower = stricter cloud filtering.',
        range: {min: 0, max: 100},
        examples: [40, 60]
    },
    {
        name: 'landsatCloudMask',
        path: '/compositeOptions/landsatCFMaskCloudMasking',
        label: 'Landsat cloud masking',
        description: 'Landsat CFMask cloud masking strength.',
        valueGuidance: 'OFF disables Landsat cloud masking. MODERATE / AGGRESSIVE move cloud, shadow, and cirrus strengths together in the GUI presets.',
        allowedValues: ['OFF', 'MODERATE', 'AGGRESSIVE'],
        valueLabels: {OFF: 'off', MODERATE: 'moderate', AGGRESSIVE: 'aggressive'}
    },
    {
        name: 'landsatShadowMask',
        path: '/compositeOptions/landsatCFMaskCloudShadowMasking',
        label: 'Landsat shadow masking',
        description: 'Landsat CFMask cloud-shadow masking strength.',
        valueGuidance: 'Usually mirrors landsatCloudMask in the GUI presets.',
        allowedValues: ['OFF', 'MODERATE', 'AGGRESSIVE'],
        valueLabels: {OFF: 'off', MODERATE: 'moderate', AGGRESSIVE: 'aggressive'}
    },
    {
        name: 'landsatCirrusMask',
        path: '/compositeOptions/landsatCFMaskCirrusMasking',
        label: 'Landsat cirrus masking',
        description: 'Landsat CFMask cirrus masking strength.',
        valueGuidance: 'Usually mirrors landsatCloudMask in the GUI presets.',
        allowedValues: ['OFF', 'MODERATE', 'AGGRESSIVE'],
        valueLabels: {OFF: 'off', MODERATE: 'moderate', AGGRESSIVE: 'aggressive'}
    },
    {
        name: 'landsatDilatedCloud',
        path: '/compositeOptions/landsatCFMaskDilatedCloud',
        label: 'Landsat dilated-cloud pixels',
        description: 'Whether to remove Landsat dilated-cloud pixels.',
        valueGuidance: 'REMOVE is the GUI default and is consistent with stricter Landsat masking.',
        allowedValues: ['KEEP', 'REMOVE'],
        valueLabels: {KEEP: 'keep', REMOVE: 'remove'}
    },
    {
        name: 'snowMasking',
        path: '/compositeOptions/snowMasking',
        label: 'Snow masking',
        description: 'Whether snow/ice pixels are masked during per-pixel masking.',
        valueGuidance: 'Keep ON by default even outside snowy regions: clouds can be misclassified as snow.',
        allowedValues: ['ON', 'OFF'],
        valueLabels: {ON: 'on', OFF: 'off'}
    },
    {
        name: 'holes',
        path: '/compositeOptions/holes',
        label: 'Empty-pixel policy',
        description: 'Whether fully-masked pixels may remain empty (ALLOW) or are backfilled (PREVENT).',
        valueGuidance: 'ALLOW is normal. PREVENT is a fallback when masking removes bright surfaces like built-up areas or deserts.',
        allowedValues: ['PREVENT', 'ALLOW'],
        valueLabels: {PREVENT: 'prevent holes', ALLOW: 'allow holes'}
    },
    {
        name: 'cloudBuffer',
        path: '/compositeOptions/cloudBuffer',
        label: 'Cloud-edge buffer',
        description: 'Spatial buffer distance around detected cloud pixels, in meters.',
        valueGuidance: '0 is fastest and most reliable. 120/600 add an expensive per-image distance-transform pass — reserve for explicit cloud-edge artifacts, not generic residual-cloud requests.',
        summaryGuidance: 'Buffering > 0 widens the cloud mask around detected clouds.',
        performanceNote: 'cloudBuffer > 0 is an expensive per-image spatial operation.',
        allowedValues: [0, 120, 600],
        valueLabels: {0: 'no buffer', 120: 'moderate (120 m)', 600: 'aggressive (600 m)'}
    },

    {
        name: 'brdfMultiplier',
        path: '/compositeOptions/brdfMultiplier',
        label: 'BRDF correction strength',
        description: 'BRDF correction strength multiplier; only relevant when corrections include BRDF.',
        valueGuidance: 'Number greater than 0. GUI default is 4.',
        performanceNote: 'BRDF correction is compute/memory-heavy; only matters when BRDF is in corrections.',
        range: {min: 0, exclusiveMin: true}
    },
    {
        name: 'targetDate',
        path: '/dates/targetDate',
        label: 'Target date',
        description: 'Central date for the yearly mosaic window (YYYY-MM-DD).',
        valueGuidance: 'Must be on or after 1982-08-22 (Landsat 4 launch). Changing it usually requires moving seasonStart and seasonEnd into the new window.',
        format: 'YYYY-MM-DD',
        examples: ['2024-07-02']
    },
    {
        name: 'seasonStart',
        path: '/dates/seasonStart',
        label: 'Season start',
        description: 'Season-window start date tied to targetDate (YYYY-MM-DD).',
        valueGuidance: 'Must be in [targetDate - 1 year + 1 day, targetDate].',
        format: 'YYYY-MM-DD',
        examples: ['2024-01-01']
    },
    {
        name: 'seasonEnd',
        path: '/dates/seasonEnd',
        label: 'Season end',
        description: 'Season-window end date tied to targetDate (YYYY-MM-DD).',
        valueGuidance: 'Must be in [targetDate + 1 day, targetDate + 1 year].',
        format: 'YYYY-MM-DD',
        examples: ['2025-01-01']
    },
    {
        name: 'yearsBefore',
        path: '/dates/yearsBefore',
        label: 'Extra previous years',
        description: 'Extra previous years included in the candidate scene pool. Integer 0-25.',
        valueGuidance: 'Larger values widen the candidate pool — higher memory/latency. 0 is the GUI default.',
        performanceNote: 'Adds years of candidate scenes; raises memory/latency.',
        range: {min: 0, max: 25}
    },
    {
        name: 'yearsAfter',
        path: '/dates/yearsAfter',
        label: 'Extra following years',
        description: 'Extra following years included in the candidate scene pool. Integer 0-25.',
        valueGuidance: 'Larger values widen the candidate pool — higher memory/latency. 0 is the GUI default.',
        performanceNote: 'Adds years of candidate scenes; raises memory/latency.',
        range: {min: 0, max: 25}
    }
]

function getHandles() {
    return HANDLES.map(handle => withDerivedValueLabels(structuredClone(handle)))
}

// Rich allowedItems carry their own labels; mirror them into the flat
// valueLabels map so summarizers can read either shape uniformly.
function withDerivedValueLabels(handle) {
    if (handle.valueLabels !== undefined) return handle
    if (!Array.isArray(handle.allowedItems)) return handle
    const labelled = handle.allowedItems
        .filter(item => item && typeof item === 'object' && item.value && item.label)
    if (!labelled.length) return handle
    return {
        ...handle,
        valueLabels: Object.fromEntries(labelled.map(item => [item.value, item.label]))
    }
}

module.exports = {getHandles}
