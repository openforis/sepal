import {defineRecipeType} from '../defineRecipeType.js'
import {DUPLICATE_BAND_NAME, INCOMPLETE_IMAGE_OUTPUT, MALFORMED_IMAGE_OUTPUT} from '../output/diagnostic.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromAoi} from '../source/aoi.js'

// BAYTS historical derives speckle statistics over its AOI from a radar mosaic it builds itself
// (lib/js/ee/src/bayts/baytsHistorical.js), so the AOI is its one external reference.

// BAYTS historical computes the statistics itself, so there is no asset to read them from.
export const historicalStatsSource = {
    statsAsset: () => null
}

// What each orbit pass contributes, in the order execution builds it: the radar time scan's statistics and orbit,
// then the speckle statistics added to them.
export const HISTORICAL_STATISTICS = ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle']

export const ORBIT_SUFFIXES = {ASCENDING: 'asc', DESCENDING: 'desc'}

const ORBITS_PATH = ['model', 'options', 'orbits']

// Every pass's statistics under its suffix, in the order the model stores the passes, all scalar and stored as
// computed. An orbit is the relative orbit a pixel's statistics came from, so coarser pyramid levels keep the most
// common one; the statistics are averaged. The suffix names a pass; which pass's imagery the statistics hold is
// execution's to establish. Meaningful only for orbits the configuration states validly (baytsHistoricalRefusals).
export const baytsHistoricalBands = model =>
    model.options.orbits.flatMap(orbit =>
        HISTORICAL_STATISTICS.map(statistic => ({
            name: `${statistic}_${ORBIT_SUFFIXES[orbit]}`,
            dataType: {arrayDimensions: 0},
            pyramidingPolicy: statistic === 'orbit' ? 'mode' : 'mean'
        }))
    )

export const baytsHistoricalBandNames = model =>
    baytsHistoricalBands(model).map(({name}) => name)

// What makes the stated orbits unusable, known from the configuration alone: none stated, a value that is no orbit
// pass, or a pass stated twice, which would name its statistics twice.
export const baytsHistoricalRefusals = model => {
    const orbits = model?.options?.orbits
    if (orbits === undefined || orbits === null || (Array.isArray(orbits) && !orbits.length)) {
        return [{code: INCOMPLETE_IMAGE_OUTPUT, path: ORBITS_PATH}]
    }
    if (!Array.isArray(orbits)) {
        return [{code: MALFORMED_IMAGE_OUTPUT, path: ORBITS_PATH}]
    }
    return orbits.flatMap((orbit, index) => {
        const path = [...ORBITS_PATH, index]
        if (typeof orbit !== 'string' || !Object.hasOwn(ORBIT_SUFFIXES, orbit)) {
            return [{code: MALFORMED_IMAGE_OUTPUT, path}]
        }
        return orbits.indexOf(orbit) < index ? [{code: DUPLICATE_BAND_NAME, path}] : []
    })
}

export default defineRecipeType({
    type: 'BAYTS_HISTORICAL',
    historicalStatsSource,
    directSources: model => fromAoi({model, keys: ['aoi']}),
    imageOutput: imageOutputProvider({
        describe: ({recipe}) => {
            const refusals = baytsHistoricalRefusals(recipe.model)
            return refusals.length
                ? {diagnostics: refusals}
                : {bands: baytsHistoricalBands(recipe.model), evidence: []}
        }
    })
})
