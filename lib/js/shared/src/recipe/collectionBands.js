import _ from 'lodash'

import {isClassifiedOutput} from './classifiedOutputs.js'
import {collectionType, PLANET, planetSource, RADAR} from './collectionType.js'
import {getAvailableIndexes, selectableBands} from './optical/opticalBands.js'
import {PLANET_DAILY_8_BANDS, planetBandNames} from './planet/planetBands.js'
import {RADAR_MEASURES} from './radar/collectionMeasures.js'

// The bands of its images a collection-backed recipe's Sources configure (lib/js/ee/src/timeSeries/collection.js): its
// data sets, an optical collection's corrections and a Planet collection's histogram matching decide them. Dates and
// cloud thresholds select images, not bands.

export const UNSUPPORTED_COLLECTION_BANDS = 'UNSUPPORTED_COLLECTION_BANDS'

// Every measure the configured collection carries, by the branch collection.js takes. Which bands Planet Daily imagery
// without histogram matching carries depends on that imagery: `nativeBands` are the band names every contributing image
// carries, where a caller read them (planetBandNames); without them, only what every Daily image carries is stated.
export const collectionMeasures = (model, nativeBands) =>
    _.uniq(measuresOf(model, nativeBands)).filter(measure => !ACQUISITION_METADATA.includes(measure))

// A requirement of a recipe whose Sources choose bands of the images at `field` - a band, or a list of them - for the
// operations that build from them: each must be one the configured collection can carry, refused at that field naming
// those it cannot (`unsupported`). Classified outputs are judged by their own rule (classifiedOutputs.js). What only
// the contributing imagery settles is never refused: unmatched Planet Daily may carry what eight-band imagery does. With
// no data set selected there is no collection to judge, and the required data sets say so.
export const collectionBandRequirement = ({field, operations}) => ({
    code: UNSUPPORTED_COLLECTION_BANDS,
    operations,
    findings: model => {
        const chosen = [].concat(model?.sources?.[field] ?? []).filter(band => !isClassifiedOutput(band))
        if (!chosen.length || !Object.values(model?.sources?.dataSets || {}).flat().length) {
            return []
        }
        const carriable = collectionMeasures(model, PLANET_DAILY_8_BANDS)
        const unsupported = chosen.filter(band => !carriable.includes(band))
        return unsupported.length ? [{path: ['model', 'sources', field], unsupported}] : []
    }
})

// The date bands a composite keeps are per-scene acquisition metadata, not a signal to analyse.
const ACQUISITION_METADATA = ['unixTimeDays', 'dayOfYear', 'daysFromTarget']

const measuresOf = (model, nativeBands) => {
    switch (collectionType(model?.sources?.dataSets)) {
        case RADAR: return RADAR_MEASURES
        case PLANET: return planetMeasures(model, nativeBands)
        default: return selectableBands(opticalModel(model))
    }
}

// The Planet collection carries whatever its own imagery and processing leave it with, and timeSeries/collection.js
// adds whichever indexes those bands support. Which collection it is comes from the first selected data set, exactly as
// planetImages reads it. What lib/js/ee/src/planet/collection.js adds to every image are working bands, not measures:
// its dates (PLANET_DATE_BANDS), and an RGB `brightness` that is not the tasseled cap's, whose SWIR inputs Planet lacks.
const planetMeasures = (model, nativeBands) => {
    const bands = planetBandNames({
        source: planetSource(model?.sources?.dataSets),
        histogramMatching: model?.options?.histogramMatching,
        nativeBands
    })
    return [...bands, ...getAvailableIndexes(bands)]
}

// Matches getCollection$: omitted corrections mean TOA without BRDF.
const opticalModel = model => ({
    sources: model?.sources,
    compositeOptions: {...model?.options, corrections: model?.options?.corrections ?? []}
})
