// Curated, reusable MOSAIC operational facts: the source of truth for multiple
// consumers (the update manual now, a troubleshooting/advice specialist later).
// A flat list of facts; each is keyed by one path or a set of interacting paths,
// tagged with topics for later selection. Facts are distilled recipe knowledge,
// not LLM/chat workflow vocabulary.

function getKnowledge() {
    return FACTS.map(fact => ({
        ...fact,
        topics: [...fact.topics],
        guidance: [...fact.guidance],
        ...(fact.path ? {path: fact.path} : {}),
        ...(fact.paths ? {paths: [...fact.paths]} : {}),
        ...(fact.inspectWhen ? {inspectWhen: [...fact.inspectWhen]} : {}),
        ...(fact.tradeoffs ? {tradeoffs: [...fact.tradeoffs]} : {}),
        ...(fact.warnings ? {warnings: [...fact.warnings]} : {})
    }))
}

const FACTS = [
    {
        path: '/compositeOptions/tileOverlap',
        purpose: 'Controls how duplicate Sentinel-2 observations on tile overlaps are handled before compositing.',
        topics: ['performance', 'rendering', 'memory', 'latency', 'sentinel2', 'time-series', 'observation-volume'],
        guidance: [
            'Sentinel-2 only; duplicate observations on tile overlaps.',
            'KEEP can INCREASE memory/latency from duplicate tile observations.',
            'QUICK_REMOVE clips S2 scenes to no-overlap tile geometries early; sensible default memory-saver.',
            'REMOVE more exact per-pixel cleanup but adds extra processing; may not save much more than QUICK_REMOVE.',
            'Overlap settings also affect time-series workflows such as CCDC; net win is workload-dependent.'
        ],
        tradeoffs: [
            'QUICK_REMOVE saves memory cheaply; REMOVE more exact but costlier.',
            'No direct quality win/loss; this is mainly memory, latency, and processing effort.'
        ],
        inspectWhen: ['Render fails', 'Earth Engine memory error', 'Timeout', 'Layer does not load', 'High memory/latency', 'Time-series workflows such as CCDC']
    },
    {
        path: '/compositeOptions/orbitOverlap',
        purpose: 'Controls how overlapping Sentinel-2 orbit observations are handled before compositing.',
        topics: ['performance', 'rendering', 'memory', 'latency', 'sentinel2', 'time-series', 'observation-volume'],
        guidance: [
            'Sentinel-2 only; removal adds orbit-band/reduction/masking work but can reduce overlap observations.',
            'Can help memory/latency for time-series workflows such as CCDC.',
            'Net win is workload-dependent and difficult to know upfront.'
        ],
        tradeoffs: [
            'KEEP avoids overlap-removal work; REMOVE can reduce downstream observation volume but adds preprocessing.',
            'No direct quality win/loss; this is mainly memory, latency, and processing effort.'
        ],
        inspectWhen: ['Render fails', 'Earth Engine memory error', 'Timeout', 'Layer does not load', 'High memory/latency', 'Time-series workflows such as CCDC']
    },
    {
        path: '/compositeOptions/includedCloudMasking',
        purpose: 'Selects the per-pixel cloud masking methods combined into the cloud mask.',
        topics: ['performance', 'rendering', 'quality', 'availability'],
        guidance: [
            'Cloud masking methods are combined inside one per-image cloud band operation.',
            'Method count itself is not a primary speed lever; choose methods for masking behavior and source availability.',
            'Sentinel-2 cloud probability and cloud score plus link ancillary collections when enabled.',
            'Source-specific methods only when their source group present.'
        ],
        inspectWhen: ['Too many clouds masked', 'Too few clouds masked', 'Source or cloud-method availability changes']
    },
    {
        path: '/compositeOptions/cloudBuffer',
        purpose: 'Controls spatial buffering around detected cloud pixels before compositing.',
        topics: ['performance', 'rendering', 'memory', 'latency', 'quality', 'spatial-operation'],
        guidance: [
            '0 fastest and most reliable.',
            '120/600 only when stricter cloud-edge masking is wanted.'
        ],
        warnings: [
            'cloudBuffer > 0 is very expensive in EE: per-image distance-transform / spatial buffering.'
        ],
        tradeoffs: ['Lower buffer faster but may leave cloud-edge artifacts.'],
        inspectWhen: ['Render fails', 'Earth Engine memory error', 'Timeout', 'Layer does not load', 'Very slow rendering', 'User asks for faster preview', 'Missing pixels around clouds']
    },
    {
        path: '/compositeOptions/filters',
        purpose: 'Selects collection-level percentile filters applied to the scene collection before compositing.',
        topics: ['performance', 'rendering', 'memory', 'latency', 'collection-reduction', 'extra-pass'],
        guidance: [
            'Each active filter with percentile > 0 adds a collection percentile reduction and masking pass.'
        ],
        warnings: [
            'Each active filter is costly: extra collection-level reduction plus masking map.'
        ],
        inspectWhen: ['Render fails', 'Earth Engine memory error', 'Timeout', 'Layer does not load', 'Very slow rendering', 'User asks for faster preview']
    },
    {
        path: '/compositeOptions/compose',
        purpose: 'Controls how surviving observations are reduced into one mosaic pixel value.',
        topics: ['performance', 'rendering', 'memory', 'latency', 'quality', 'collection-reduction'],
        guidance: [
            'MEDIAN is a direct collection median and is cheaper.',
            'MEDOID computes a median, maps distance-to-median, then qualityMosaic; it adds collection reduction and extra per-image work.',
            'MEDOID preserves a real multi-band observation, useful for indexes/classification/regression; MEDIAN is often acceptable for visual previews.'
        ],
        tradeoffs: [
            'MEDIAN improves speed/reliability for visual use; MEDOID keeps spectral consistency at higher cost.'
        ],
        inspectWhen: ['Render fails', 'Earth Engine memory error', 'Timeout', 'Layer does not load', 'Very slow rendering', 'User asks for faster preview']
    },
    {
        path: '/compositeOptions/snowMasking',
        purpose: 'Controls whether snow is masked during per-pixel cloud/snow masking.',
        topics: ['quality'],
        guidance: [
            'Keep snow masking ON by default even in tropics: clouds can be misclassified as snow.'
        ],
        inspectWhen: ['Clouds remain unmasked', 'Unexpected snow/cloud masking behavior']
    },
    {
        path: '/compositeOptions/holes',
        purpose: 'Controls whether fully-masked pixels are backfilled to avoid gaps.',
        topics: ['rendering', 'quality', 'completeness'],
        guidance: [
            'ALLOW normal.',
            'PREVENT is a fallback when masking wrongly removes target features; it keeps cloudy/snowy fallback pixels only where all observations would otherwise be masked.',
            'Usually first try more data, a better date range, or less aggressive masking.'
        ],
        tradeoffs: ['ALLOW normal; PREVENT fills more but adds a collection-level mask check and is a fallback.'],
        inspectWhen: ['Masked-out pixels', 'All observations masked', 'Cloud/snow masking removes target features']
    },
    {
        paths: ['/compositeOptions/corrections', '/compositeOptions/brdfMultiplier'],
        purpose: 'Controls per-scene radiometric corrections, including BRDF view-angle correction and its strength.',
        topics: ['performance', 'rendering', 'memory', 'latency', 'quality', 'brdf'],
        guidance: [
            'BRDF corrects view-angle effects; brdfMultiplier controls correction strength when BRDF is enabled.',
            'Removing BRDF is a major render-reliability lever, especially for Sentinel-2 and large mosaics.'
        ],
        warnings: [
            'BRDF is expensive; Sentinel-2 BRDF especially likely to make large mosaics slow or fail.'
        ],
        tradeoffs: ['Removing BRDF improves render reliability but trades cross-scene radiometric consistency.'],
        inspectWhen: ['Render fails', 'Earth Engine memory error', 'Timeout', 'Layer does not load', 'Very slow rendering', 'Sentinel-2 with large AOI or date window']
    },
    {
        path: '/sceneSelectionOptions/type',
        purpose: 'Controls whether all matching scenes or only manually selected scenes form the scene pool.',
        topics: ['performance', 'validation'],
        guidance: [
            'ALL uses all scenes matching date/source/cloud filters; required for mixed Landsat + Sentinel-2.',
            'SELECT uses manually selected scenes, so performance depends on the selected scene count.'
        ]
    },
    {
        paths: ['/dates/seasonStart', '/dates/seasonEnd', '/dates/yearsBefore', '/dates/yearsAfter', '/sources/cloudPercentageThreshold', '/sources/dataSets'],
        purpose: 'Controls the candidate scene pool size via date window, cloud threshold, and source groups.',
        topics: ['performance', 'rendering', 'memory', 'latency', 'observation-volume', 'availability'],
        guidance: [
            'Candidate scene count is a core driver of memory, latency, and render failure risk.',
            'Wider seasons, yearsBefore/yearsAfter, and more source groups increase candidate scenes.',
            'Lower cloudPercentageThreshold filters cloudiest scenes before processing, but too low can leave no imagery.'
        ],
        tradeoffs: [
            'Tighter windows and fewer sources improve reliability but can reduce coverage and clear observations.'
        ],
        inspectWhen: ['Render fails', 'Earth Engine memory error', 'Timeout', 'Layer does not load', 'Very slow rendering', 'No imagery', 'User asks for faster preview']
    },
    {
        paths: ['/sources/dataSets', '/compositeOptions/corrections', '/sceneSelectionOptions/type'],
        purpose: 'Controls which source groups are combined and the correction/scene-selection constraints that combination imposes.',
        topics: ['validation', 'sources'],
        guidance: [
            'Mixed Landsat + Sentinel-2 requires CALIBRATE, not SR.',
            'Mixed Landsat + Sentinel-2 requires sceneSelectionOptions.type=ALL.'
        ],
        inspectWhen: ['Source changes', 'Calibration or validation errors']
    },
    {
        paths: ['/sources/dataSets', '/compositeOptions/corrections', '/dates/targetDate', '/dates/seasonStart', '/dates/seasonEnd'],
        purpose: 'Controls Sentinel-2 surface-reflectance availability across the requested date range.',
        topics: ['availability', 'sentinel2', 'surface-reflectance'],
        guidance: [
            'Sentinel-2 SR has historical coverage caveats: 2017-2018 not globally covered in EE.'
        ],
        tradeoffs: [
            'For older Sentinel-2 date ranges, TOA may have broader coverage than SR.'
        ],
        inspectWhen: ['Render fails', 'No imagery', 'Older Sentinel-2 date range', 'Sentinel-2 SR']
    }
]

module.exports = {getKnowledge}
