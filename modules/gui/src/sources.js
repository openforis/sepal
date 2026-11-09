import {dataSetYears, excludedDataSets} from '#sepal/recipe/dataSetAvailability'
import {RADAR_MEASURES} from '#sepal/recipe/radar/collectionMeasures'
import {supportProbability, supportRegression} from '#sepal/recipe/type/classification'
import {getAvailableBands as getAvailableOpticalBands, getGroupedBandOptions as getGroupedOpticalBandOptions} from '~/app/home/body/process/recipe/opticalMosaic/bands'
import {getDataSetOptions as opticalDataSetOptions, isOpticalDataSet, toSources as toOpticalSources} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {TEMPORAL_PLANET_BANDS, temporalPlanetBandOptions} from '~/app/home/body/process/recipe/planetMosaic/bands'
import {getDataSetOptions as planetDataSetOptions, toSources as toPlanetSources} from '~/app/home/body/process/recipe/planetMosaic/sources'
import {
    getDataSetOptions as radarDataSetOptions,
    groupedMeasureOptions as groupedRadarMeasureOptions,
    isRadarDataSet,
    toSources as toRadarSources
} from '~/app/home/body/process/recipe/radarMosaic/sources'

import {msg} from './translate'

// The data sets Sources offer of a collection type (OPTICAL, RADAR or PLANET), judged against the years the recipe's
// execution reads (`period`, the dataSetPeriod its shared type declares). One that may hold no imagery then cannot be
// chosen anew. One the draft has `chosen` stays chosen and can be removed, its tooltip giving the years it holds imagery
// for: a date change takes no choice away. Once removed, it is offered again only by a period it may hold imagery in.
// What a selection none of which may contribute needs is said beside the data sets (dataSetPeriodRequirement.js).
// Without a period, none is judged.
export const dataSetOptions = ({type, period, chosen}) => {
    const kept = asList(chosen)
    return typeDataSetOptions(type).map(option => {
        if (!excludedDataSets([option.value], period).length) {
            return option
        }
        return kept.includes(option.value)
            ? {...option, tooltip: [catalogueYears(option.value), option.tooltip]}
            : {...option, neverSelected: true}
    })
}

// What Sources start a collection type with when the type changes: its first data set that may hold imagery in `period`.
export const defaultDataSet = (type, period) => typeDataSetOptions(type)
    .map(({value}) => value)
    .find(dataSet => !excludedDataSets([dataSet], period).length)

// What Sources propose of the data sets `preferred`, for `period`: each that may hold imagery in it, or else the first
// data set of their collection type that may (defaultDataSet), or else none, to be chosen.
export const initialDataSets = (preferred, period) => {
    const contributing = preferred.filter(dataSet => !excludedDataSets([dataSet], period).length)
    return contributing.length
        ? contributing
        : [defaultDataSet(dataSetTypeOf(preferred), period)].filter(Boolean)
}

// The collection type of data sets: optical where any is, radar where any is, and otherwise Planet.
export const dataSetTypeOf = dataSetIds => dataSetIds.some(isOpticalDataSet)
    ? 'OPTICAL'
    : dataSetIds.some(isRadarDataSet) ? 'RADAR' : 'PLANET'

export const toSources = dataSetIds =>
    ({...toOpticalSources(dataSetIds), ...toRadarSources(dataSetIds), ...toPlanetSources(dataSetIds)})

// The data sets a recipe's Sources choose, by identifier: none where it holds no data sets - a recipe whose Sources the
// set-up wizard has not yet committed (initialSources.js), or one saved without them.
export const toDataSetIds = sources =>
    Object.values(sources || {}).flat()

export const getAvailableBands = ({
    dataSetId,
    dataSets = [],
    corrections,
    classification: {
        classifier,
        classifierType,
        classificationLegend,
        include = ['class', 'regression', 'class_probability', 'probabilities']
    } = {}
}) => {
    const dataSetIds = dataSets || (dataSetId ? [dataSetId] : [])
    const dataSetBands = dataSetIds.find(dataSetId => isOpticalDataSet(dataSetId))
        ? Object.keys(getAvailableOpticalBands(
            toOpticalRecipe({dataSetIds, corrections}),
            ['indexes', 'dataSetBands']
        ))
        : dataSetIds.find(dataSetId => isRadarDataSet(dataSetId))
            ? RADAR_MEASURES
            : TEMPORAL_PLANET_BANDS.flat()
    const classificationBands = getClassificationBands(classifier || classifierType, classificationLegend, include)
    return [...dataSetBands, ...classificationBands]
}

export const groupedBandOptions = ({
    dataSetId,
    dataSets = [],
    corrections,
    classification: {
        classifier,
        classifierType,
        classificationLegend,
        include = ['class', 'regression', 'class_probability', 'probabilities']
    } = {}
}) => {
    const dataSetIds = dataSets || (dataSetId ? [dataSetId] : [])
    
    const isOptical = () => dataSetIds.find(dataSetId => isOpticalDataSet(dataSetId))
    const isRadar = () => dataSetIds.find(dataSetId => isRadarDataSet(dataSetId))

    const getOpticalOptions = () =>
        getGroupedOpticalBandOptions(
            toOpticalRecipe({dataSetIds, corrections}),
            ['dataSetBands', 'indexes']
        )

    const getRadarOptions = () =>
        groupedRadarMeasureOptions()

    const getPlanetOptions = () =>
        temporalPlanetBandOptions()

    const classificationOptions =
        getClassificationOptions(classifier || classifierType, classificationLegend, include)

    const dataSetOptions = (isOptical() && getOpticalOptions() || isRadar() && getRadarOptions() || getPlanetOptions())
    
    return [...dataSetOptions, classificationOptions]
}

export const flatBandOptions = ({
    dataSetId,
    dataSets = [],
    corrections,
    classification: {
        classifier,
        classifierType,
        classificationLegend,
        include = ['class', 'regression', 'class_probability', 'probabilities']
    } = {}
}) => groupedBandOptions({
    dataSetId,
    dataSets,
    corrections,
    classification: {
        classifier,
        classifierType,
        classificationLegend,
        include
    }
}).flat()

// Grouped options with a group of their own for each choice none offers - a band the configured collection no longer
// carries, a classified output the Classification no longer provides, or one not yet known to - in the order chosen, so a
// choice saved is shown as made, where what it is refused for is said, and can be taken back. Each is named as `labelOf`
// names it (chosenBandLabel).
export const withChosenBands = (groupedOptions, chosen, labelOf) => {
    const offered = groupedOptions.flat().map(({value}) => value)
    const unoffered = [].concat(chosen ?? []).filter(band => !offered.includes(band))
    return unoffered.length
        ? [...groupedOptions, unoffered.map(band => ({value: band, label: labelOf(band)}))]
        : groupedOptions
}

const typeDataSetOptions = type => {
    switch (type) {
        case 'OPTICAL': return opticalDataSetOptions()
        case 'RADAR': return radarDataSetOptions()
        case 'PLANET': return planetDataSetOptions()
        default: return []
    }
}

const catalogueYears = dataSet => {
    const {fromYear, toYear} = dataSetYears(dataSet)
    return toYear === undefined
        ? msg('process.source.dataSets.years.from', {fromYear})
        : msg('process.source.dataSets.years.range', {fromYear, toYear})
}

const asList = dataSets => [dataSets ?? []].flat().filter(Boolean)

const toOpticalRecipe = ({dataSetIds, corrections}) =>
    ({model: {
        type: 'MOSAIC',
        sources: {dataSets: toSources(dataSetIds)},
        compositeOptions: {
            corrections,
            compose: 'MEDIAN'
        }
    }})

// What the Classification offers, by what its classifier supports: its configuration (`classifier`, model.classifier) where a
// caller has it, so its SVM type counts, otherwise its type alone (`classifierType`).
const getClassificationBands = (classifier, classificationLegend, include) => classifier && classificationLegend
    ? [
        include.includes('class') ? ['class'] : [],
        include.includes('regression') && supportRegression(classifier) ? ['regression'] : [],
        include.includes('class_probability') && supportProbability(classifier) ? ['class_probability'] : [],
        include.includes('probabilities') && supportProbability(classifier)
            ? classificationLegend.entries.map(({value}) => `probability_${value}`)
            : []
    ].flat()
    : []

const getClassificationOptions = (classifier, classificationLegend, include) => classifier && classificationLegend && classificationLegend.entries
    ? [
        include.includes('class')
            ? [{
                mosaicMultiplier: 1,
                timeSeriesMultiplier: 1,
                value: 'class',
                label: msg('process.classification.bands.class')
            }]
            : [],
        include.includes('regression') && supportRegression(classifier)
            ? [{
                mosaicMultiplier: 100,
                timeSeriesMultiplier: 100,
                value: 'regression',
                label: msg('process.classification.bands.regression')
            }]
            : [],
        include.includes('class_probability') && supportProbability(classifier)
            ? [{
                mosaicMultiplier: 100,
                timeSeriesMultiplier: 100,
                value: 'class_probability',
                label: msg('process.classification.bands.classProbability')
            }]
            : [],
        include.includes('probabilities') && supportProbability(classifier)
            ? classificationLegend.entries.map(({value, label}) => ({
                mosaicMultiplier: 100,
                timeSeriesMultiplier: 100,
                value: `probability_${value}`,
                label: msg('process.classification.bands.probability', {class: label})
            }))
            : []
    ].flat()
    : []
