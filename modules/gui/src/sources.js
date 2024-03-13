import {getAvailableBands as getAvailableOpticalBands, getGroupedBandOptions as getGroupedOpticalBandOptions} from '~/app/home/body/process/recipe/opticalMosaic/bands'
import {getAvailableBands as getAvailablePlanetBands, getGroupedBandOptions as getGroupedPlanetBandOptions} from '~/app/home/body/process/recipe/planetMosaic/bands'
import {getAvailableBands as getAvailableRadarBands, getGroupedBandOptions as getGroupedRadarBandOptions} from '~/app/home/body/process/recipe/radarMosaic/bands'
import {isOpticalDataSet, getDataSetOptions as opticalDataSetOptions, toSources as toOpticalSources} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {isRadarDataSet, getDataSetOptions as radarDataSetOptions, toSources as toRadarSources} from '~/app/home/body/process/recipe/radarMosaic/sources'
import {msg} from './translate'
import {supportProbability, supportRegression} from './app/home/body/process/recipe/classification/classificationRecipe'
import {toSources as toPlanetSources} from '~/app/home/body/process/recipe/planetMosaic/sources'

export const groupedDataSetOptions = ({dataSetIds, startDate, endDate}) => {
    const opticalDisabled = dataSetIds && dataSetIds.find(dataSetId => !isOpticalDataSet(dataSetId))
    const radarDisabled = dataSetIds && dataSetIds.find(dataSetId => isOpticalDataSet(dataSetId))

    const opticalOptions = opticalDataSetOptions({startDate, endDate})
        .map(option => ({...option, neverSelected: option.neverSelected || opticalDisabled}))

    const radarOptions = radarDataSetOptions({startDate, endDate})
        .map(option => ({...option, neverSelected: option.neverSelected || radarDisabled}))

    return [
        {label: msg('sources.optical.label'), disabled: opticalDisabled, options: opticalOptions},
        {label: msg('sources.radar.label'), disabled: radarDisabled, options: radarOptions}
    ]
}

export const toSources = dataSetIds =>
    ({...toOpticalSources(dataSetIds), ...toRadarSources(dataSetIds), ...toPlanetSources(dataSetIds)})

export const toDataSetIds = sources =>
    Object.values(sources).flat()

export const getAvailableBands = ({
    dataSetId,
    dataSets = [],
    corrections,
    classification: {
        classifierType,
        classificationLegend,
        include = ['class', 'regression', 'class_probability', 'probabilities']
    } = {}
}) => {
    const dataSetIds = dataSets || (dataSetId ? [dataSetId] : [])
    const dataSetBands = Object.keys(
        dataSetIds.find(dataSetId => isOpticalDataSet(dataSetId))
            ? getAvailableOpticalBands(
                toOpticalRecipe({dataSetIds, corrections}),
                ['indexes', 'dataSetBands']
            )
            : dataSetIds.find(dataSetId => isRadarDataSet(dataSetId))
                ? getAvailableRadarBands(
                    toRadarRecipe(),
                    ['indexes', 'dataSetBands']
                )
                : getAvailablePlanetBands(
                    toPlanetRecipe(),
                    ['indexes', 'dataSetBands'])
    )
    const classificationBands = getClassificationBands(classifierType, classificationLegend, include)
    return [...dataSetBands, ...classificationBands]
}

export const groupedBandOptions = ({
    dataSetId,
    dataSets = [],
    corrections,
    classification: {
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
        getGroupedRadarBandOptions(
            toRadarRecipe(),
            ['indexes', 'dataSetBands']
        )

    const getPlanetOptions = () =>
        getGroupedPlanetBandOptions(
            toPlanetRecipe(),
            ['indexes', 'dataSetBands']
        )

    const classificationOptions =
        getClassificationOptions(classifierType, classificationLegend, include)

    const dataSetOptions = (isOptical() && getOpticalOptions() || isRadar() && getRadarOptions() || getPlanetOptions())
    
    return [...dataSetOptions, classificationOptions]
}

export const flatBandOptions = ({
    dataSetId,
    dataSets = [],
    corrections,
    classification: {
        classifierType,
        classificationLegend,
        include = ['class', 'regression', 'class_probability', 'probabilities']
    } = {}
}) => groupedBandOptions({
    dataSetId,
    dataSets,
    corrections,
    classification: {
        classifierType,
        classificationLegend,
        include
    }
}).flat()

const toOpticalRecipe = ({dataSetIds, corrections}) =>
    ({model: {
        type: 'MOSAIC',
        sources: {dataSets: toSources(dataSetIds)},
        classificationOptions: {
            corrections,
            compose: 'MEDIAN'
        }
    }})

const toRadarRecipe = () =>
    ({model: {
        type: 'RADAR_MOSAIC',
        dates: {
            targetDate: '9999-01-01'
        }
    }})
const toPlanetRecipe = () =>
    ({model: {
        type: 'PLANET_MOSAIC'
    }})

const getClassificationBands = (classifierType, classificationLegend, include) => classifierType && classificationLegend
    ? [
        include.includes('class') ? ['class'] : [],
        include.includes('regression') && supportRegression(classifierType) ? ['regression'] : [],
        include.includes('class_probability') && supportProbability(classifierType) ? ['class_probability'] : [],
        include.includes('probabilities') && supportProbability(classifierType)
            ? classificationLegend.entries.map(({value}) => `probability_${value}`)
            : []
    ].flat()
    : []

const getClassificationOptions = (classifierType, classificationLegend, include) => classifierType && classificationLegend && classificationLegend.entries
    ? [
        include.includes('class')
            ? [{
                mosaicMultiplier: 1,
                timeSeriesMultiplier: 1,
                value: 'class',
                label: msg('process.classification.bands.class')
            }]
            : [],
        include.includes('regression') && supportRegression(classifierType)
            ? [{
                mosaicMultiplier: 100,
                timeSeriesMultiplier: 100,
                value: 'regression',
                label: msg('process.classification.bands.regression')
            }]
            : [],
        include.includes('class_probability') && supportProbability(classifierType)
            ? [{
                mosaicMultiplier: 100,
                timeSeriesMultiplier: 100,
                value: 'class_probability',
                label: msg('process.classification.bands.classProbability')
            }]
            : [],
        include.includes('probabilities') && supportProbability(classifierType)
            ? classificationLegend.entries.map(({value, label}) => ({
                mosaicMultiplier: 100,
                timeSeriesMultiplier: 100,
                value: `probability_${value}`,
                label: msg('process.classification.bands.probability', {class: label})
            }))
            : []
    ].flat()
    : []
