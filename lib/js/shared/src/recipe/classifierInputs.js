import _ from 'lodash'

import {collectionType, OPTICAL, PLANET, planetSource, RADAR} from './collectionType.js'
import {excludedDataSets} from './dataSetAvailability.js'
import {OPTICAL_DATA_SET_YEARS} from './optical/dataSetYears.js'
import {getAvailableIndexes, sceneBands} from './optical/opticalBands.js'
import {PLANET_DAILY_8_BANDS, PLANET_DATE_BANDS, planetBandNames} from './planet/planetBands.js'
import {RADAR_CLASSIFIED_BANDS} from './radar/collectionMeasures.js'
import {RADAR_DATA_SET_YEARS} from './radar/dataSetYears.js'

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
// only afterwards; a Planet image the bands its imagery carries, renamed, with the date bands its collection adds to
// every image (PLANET_DATE_BANDS), indexes added only afterwards. The RGB brightness it also adds is a working band, not
// the tasseled cap's a classifier may read, so it supplies no `brightness`. To each, the indexes the
// classifier computes from those bands. Which Planet Daily imagery contributes is not known here, so a band some of it
// carries is never taken for one missing.
//
// Configuration alone: the Classification's record, not its image output, and the collection its own recipe
// configures. Nothing here is evidence, and a record not held judges nothing.

// A recipe whose collection's images cannot carry every feature the classifier of the Classification it selects reads -
// what its input's band sets include (classifierInputs.js) - listed as `missing`, naming the repairs that supply them
// all (unsuppliedClassifierFeatures). Located at the data sets where data sets that can be chosen carry them, otherwise
// at the classification.
export const UNSUPPLIED_CLASSIFIER_INPUTS = 'UNSUPPLIED_CLASSIFIER_INPUTS'

// The data sets Sources offer, by the identifier they save, of an optical collection and of a radar one.
export const OPTICAL_DATA_SETS = Object.keys(OPTICAL_DATA_SET_YEARS)
export const RADAR_DATA_SETS = Object.keys(RADAR_DATA_SET_YEARS)

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
            return [...bands, ...PLANET_DATE_BANDS, ...getAvailableIndexes(bands)]
        }
    }
}

// What a recipe whose collection `model` configures cannot feed the classifier, as UNSUPPLIED_CLASSIFIER_INPUTS: none
// where nothing is missing, or nothing can be judged. The repairs are judged among the `offered` data sets for the
// `period` its execution reads (unsuppliedClassifierFeatures), and the years that period covers are named beside data
// sets it excludes.
export const unsuppliedClassifierInputFindings = ({period, ...judged}) => {
    const unsupplied = unsuppliedClassifierFeatures({...judged, period})
    if (!unsupplied) {
        return []
    }
    return unsupplied.alternatives
        ? [{path: ['model', 'sources', 'dataSets'], ...unsupplied}]
        : [{path: ['model', 'sources', 'classification'], ...unsupplied, ...unsupplied.unavailable && period}]
}

// What of the `required` features the collection `model` configures lacks, as `missing`, and the first repair the
// catalogue establishes for all of them among the `offered` data sets: null where nothing is missing, or nothing can be
// judged. A selection supplies only what each of its data sets does, so a repair names data sets that alone supply
// every feature, and replace the selection; one supplying only some is none. A data set `period` excludes cannot be
// chosen anew (excludedDataSets): without a period, none is.
//
// `alternatives`: data sets that can be chosen and supply them as the collection is processed now. Failing those, for
// an optical collection, `reflectance`: the other correction, `to`, under which the chosen data sets supply them
// (`chosen`) or data sets that can be chosen do (`alternatives`). Failing those, `unavailable`: data sets that supply
// them as processed now, but that `period` excludes. Otherwise nothing: none can be chosen now that supplies them, as
// processed now.
const unsuppliedClassifierFeatures = ({required, model, offered = [], period}) => {
    const supplied = classifiedImageFeatures(model)
    if (!required?.length || !supplied) {
        return null
    }
    const missing = required.filter(feature => !supplied.includes(feature))
    if (!missing.length) {
        return null
    }
    const reflectance = reflectanceOf(model.options)
    const suppliers = offered.filter(dataSet => suppliesAll(required, featuresOf(dataSet, reflectance)))
    const alternatives = choosable(suppliers, period)
    if (alternatives.length) {
        return {missing, alternatives}
    }
    const repair = reflectanceRepair({required, model, offered, period})
    if (repair) {
        return {missing, reflectance: repair}
    }
    return suppliers.length ? {missing, unavailable: suppliers} : {missing}
}

// Matches getCollection$: omitted corrections mean top of atmosphere.
export const reflectanceOf = options => (options?.corrections || []).includes('SR') ? 'SR' : 'TOA'

// The correction an optical collection is not processed with, under which its data sets, or optical ones that can be
// chosen, supply every `required` feature: null where it is not optical, or neither does.
const reflectanceRepair = ({required, model, offered, period}) => {
    if (collectionType(model.sources.dataSets) !== OPTICAL) {
        return null
    }
    const to = reflectanceOf(model.options) === 'SR' ? 'TOA' : 'SR'
    if (suppliesAll(required, sceneBands(Object.values(model.sources.dataSets).flat(), to))) {
        return {to, chosen: true}
    }
    const suppliers = offered
        .filter(dataSet => OPTICAL_DATA_SETS.includes(dataSet))
        .filter(dataSet => suppliesAll(required, sceneBands([dataSet], to)))
    const alternatives = choosable(suppliers, period)
    return alternatives.length ? {to, alternatives} : null
}

// What one data set's images carry where they are classified, under `reflectance` where optical.
const featuresOf = (dataSet, reflectance) => RADAR_DATA_SETS.includes(dataSet)
    ? RADAR_CLASSIFIED_BANDS
    : sceneBands([dataSet], reflectance)

const suppliesAll = (required, features) => required.every(feature => features.includes(feature))

const choosable = (dataSets, period) => {
    const excluded = excludedDataSets(dataSets, period)
    return dataSets.filter(dataSet => !excluded.includes(dataSet))
}
