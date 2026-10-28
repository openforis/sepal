import _ from 'lodash'

import {collectionType, OPTICAL, PLANET, planetSource, RADAR} from './collectionType.js'
import dataSetSpecs from './optical/dataSetSpecs.js'
import {getAvailableIndexes, sceneBands} from './optical/opticalBands.js'
import {PLANET_DAILY_8_BANDS, PLANET_GENERATED_BANDS, planetBandNames} from './planet/planetBands.js'
import {RADAR_CLASSIFIED_BANDS} from './radar/collectionMeasures.js'

// Whether a collection's images can feed a Classification's classifier, for a recipe that classifies them with it.
//
// The classifier reads, of every image, the features its input's band sets include (classifyImage's addCovariates in
// lib/js/ee/src/classification/classification.js): image bands, the indexes it computes from them, and pairwise
// combinations of them. The latitude, terrain and water imagery it adds it generates itself, so no image need carry
// it. Only a Classification with one input classifies anything; one with several, or none, is judged for nothing here.
//
// What an image carries where it is classified is what its processing has built by then
// (lib/js/ee/src/timeSeries/collection.js): an optical scene its data sets' common bands, tasseled cap where they hold
// its inputs, and every index they compute (sceneBands); a radar scene its polarisations and orbit, the ratio derived
// only afterwards; a Planet image the bands its imagery carries, renamed, with the brightness and date bands its
// collection adds to every image (PLANET_GENERATED_BANDS), indexes added only afterwards. To each, the indexes the
// classifier computes from those bands. Which Planet Daily imagery contributes is not known here, so a band some of it
// carries is never taken for one missing.
//
// Configuration alone: the Classification's record, not its image output, and the collection its own recipe
// configures. Nothing here is evidence, and a record not held judges nothing.

// A recipe whose collection's images cannot carry every feature the classifier of the Classification it selects reads -
// what its input's band sets include (classifierInputs.js) - listed as `missing`. Located at the data sets where another
// supported collection could carry them, otherwise at the classification.
export const UNSUPPLIED_CLASSIFIER_INPUTS = 'UNSUPPLIED_CLASSIFIER_INPUTS'

// The features a Classification's classifier reads of an image, from the record of the one selected: none to judge
// while none is selected, or held, or it is not one that can classify.
export const classifierFeatures = records => {
    const images = records?.length === 1 ? records[0].model?.inputImagery?.images || [] : []
    return images.length === 1
        ? _.uniq((images[0].bandSetSpecs || []).flatMap(({included = []}) => included))
        : []
}

// The features each image of the collection `sources` and `options` configure carries where it is classified: null
// while no data set is chosen.
export const classifiedImageFeatures = ({sources, options} = {}) => {
    const dataSets = Object.values(sources?.dataSets || {}).flat()
    if (!dataSets.length) {
        return null
    }
    switch (collectionType(sources.dataSets)) {
        case OPTICAL:
            return sceneBands(dataSets, reflectanceOf(options))
        case RADAR:
            return RADAR_CLASSIFIED_BANDS
        case PLANET: {
            const bands = planetBandNames({
                source: planetSource(sources.dataSets),
                histogramMatching: options?.histogramMatching,
                nativeBands: PLANET_DAILY_8_BANDS
            })
            return [...bands, ...PLANET_GENERATED_BANDS, ...getAvailableIndexes(bands)]
        }
    }
}

// What of the `required` features `supplied` lacks, and whether one of `alternatives` - what each data set that could be
// chosen instead supplies - carries them all: null where nothing is missing, or nothing can be judged.
export const unsuppliedClassifierFeatures = ({required, supplied, alternatives = []}) => {
    if (!required?.length || !supplied) {
        return null
    }
    const missing = required.filter(feature => !supplied.includes(feature))
    return missing.length
        ? {missing, alternative: alternatives.some(alternative => required.every(feature => alternative.includes(feature)))}
        : null
}

// What each optical data set alone supplies, at the reflectance `options` correct to.
export const opticalAlternatives = options =>
    Object.keys(dataSetSpecs[reflectanceOf(options)] || {}).map(dataSet => sceneBands([dataSet], reflectanceOf(options)))

export const RADAR_ALTERNATIVE = RADAR_CLASSIFIED_BANDS

// Matches getCollection$: omitted corrections mean top of atmosphere.
export const reflectanceOf = options => (options?.corrections || []).includes('SR') ? 'SR' : 'TOA'
