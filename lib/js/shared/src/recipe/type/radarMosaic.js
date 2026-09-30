import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromAoi} from '../source/aoi.js'

// A radar mosaic composites Sentinel-1 and clips to its AOI (lib/js/ee/src/radar/mosaic.js). The collection
// is fixed in the implementation, so the AOI is its one external reference.

export const POINT_IN_TIME = 'POINT_IN_TIME'
export const TIME_SCAN = 'TIME_SCAN'

// Which composite a configuration builds: any target date makes it a point in time, whatever other dates it states,
// and anything else is a time scan. This is the branch execution takes, and it validates no date: a recipe stating
// none is described as a time scan and fails when run.
export const radarMosaicConfiguration = model =>
    model?.dates?.targetDate ? POINT_IN_TIME : TIME_SCAN

// The statistics a time scan reduces the collection to, which the composite selects by.
export const TIME_SCAN_STATISTICS = [
    'VV_min', 'VV_max', 'VV_mean', 'VV_std', 'VV_med',
    'VH_min', 'VH_max', 'VH_mean', 'VH_std', 'VH_med',
    'ratio_VV_med_VH_med', 'VV_cv', 'VH_cv', 'NDCV', 'orbit'
]

// What a harmonic fit composes for one polarisation, in the order it adds them, which the fit selects by: phase,
// amplitude, residuals, the intercept and the slope per year.
export const HARMONIC_BAND_SUFFIXES = ['phase', 'amp', 'res', 'const', 't']

export const harmonicBands = polarisation =>
    HARMONIC_BAND_SUFFIXES.map(suffix => `${polarisation}_${suffix}`)

export const HARMONIC_POLARISATIONS = ['VV', 'VH']

// The public output of each configuration, in the order execution builds it, all scalar and without encoding. A point
// in time is the observation closest to its target date: backscatter, their ratio, and the orbit and date it came
// from. A time scan is the period's statistics, then each polarisation's harmonic fit; which harmonics are computed
// for a request is execution's concern, and the output holds them all. Bands used only to construct these - angle,
// quality, unixTimeDays, the per-image harmonic terms - are not part of it.
//
// Coarser pyramid levels average the measurements, keep the most common orbit, and sample dates and phases, which no
// average of neighbours holds: a mean of two days or two angles either side of a wrap is neither.
export const RADAR_MOSAIC_BANDS = {
    [POINT_IN_TIME]: [
        scalar('VV', 'mean'),
        scalar('VH', 'mean'),
        scalar('ratio_VV_VH', 'mean'),
        scalar('orbit', 'mode'),
        scalar('dayOfYear', 'sample'),
        scalar('daysFromTarget', 'sample')
    ],
    [TIME_SCAN]: [
        ...TIME_SCAN_STATISTICS.map(name => scalar(name, name === 'orbit' ? 'mode' : 'mean')),
        ...HARMONIC_POLARISATIONS.flatMap(harmonicBands).map(name => scalar(name, name.endsWith('_phase') ? 'sample' : 'mean'))
    ]
}

export const radarMosaicBands = model =>
    RADAR_MOSAIC_BANDS[radarMosaicConfiguration(model)]

export default defineRecipeType({
    type: 'RADAR_MOSAIC',
    directSources: model => fromAoi({model, keys: ['aoi']}),
    imageOutput: imageOutputProvider({
        describe: ({recipe}) => ({bands: radarMosaicBands(recipe.model), evidence: []})
    })
})

function scalar(name, pyramidingPolicy) {
    return {name, dataType: {arrayDimensions: 0}, pyramidingPolicy}
}
