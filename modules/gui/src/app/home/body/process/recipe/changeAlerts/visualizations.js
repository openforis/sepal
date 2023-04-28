import {msg} from 'translate'
import {normalize} from 'app/home/map/visParams/visParams'
import {visualizationOptions as opticalVisualizationOptions} from 'app/home/body/process/recipe/opticalMosaic/visualizations'
import {visualizationOptions as planetVisualizationOptions} from 'app/home/body/process/recipe/planetMosaic/visualizations'
import {visualizationOptions as radarVisualizationOptions} from 'app/home/body/process/recipe/radarMosaic/visualizations'
import {selectFrom} from 'stateUtils'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const getPreSetVisualizations = recipe => getChangeVisualizations(recipe)
    .map(({options}) => options.map(({visParams}) => visParams))
    .flat()

const toFractionalYear = date => {
    const startOfYear = moment(date, DATE_FORMAT).startOf(year)
    const startOfNextYear = moment(startOfYear).add(1, 'years')
    const dayOfYear = moment(date).dayOfYear()
    const daysInYear = moment(startOfNextYear).diff(moment(startOfYear), 'days')
    const fraction = dayOfYear / daysInYear
    const year = moment(date).get('year')
    return year + fraction
}

export const visualizationOptions = (recipe, visualizationType, mosaicType) => {
    return visualizationType === 'changes'
        ? getChangeVisualizations(recipe)
        : getMosaicVisualizations(recipe, visualizationType, mosaicType)
}

const getMosaicVisualizations = (recipe, visualizationType, mosaicType) => {
    const dataSetType = selectFrom(recipe, 'model.sources.dataSetType')
    switch(dataSetType) {
    case 'OPTICAL': return toOpticalVisualizations(recipe)
    case 'RADAR': return toRadarVisualizations(recipe, visualizationType, mosaicType)
    case 'PLANET': return toPlanetVisualizations(recipe)
    default: return []
    }
}

const toOpticalVisualizations = recipe => {
    const opticalRecipe = {
        model: {
            sources: selectFrom(recipe, 'model.sources.dataSets'),
            compositeOptions: {
                corrections: selectFrom(recipe, 'model.options.corrections'),
                compose: 'MEDIAN',
            }
        }
    }
    return opticalVisualizationOptions(opticalRecipe)
}

const toRadarVisualizations = (recipe, visualizationType, mosaicType) => {
    const {
        monitoringEnd,
        monitoringDuration, monitoringDurationUnit,
        calibrationDuration, calibrationDurationUnit
    } = selectFrom(recipe, 'model.date')
    const monitoringStart = moment(monitoringEnd, DATE_FORMAT)
        .subtract(monitoringDuration, monitoringDurationUnit)
        .format(DATE_FORMAT)
    const calibrationStart = moment(monitoringStart, DATE_FORMAT)
        .subtract(calibrationDuration, calibrationDurationUnit)
        .format(DATE_FORMAT)
    const radarRecipe = {
        model: {
            dates: {
                targetDate: mosaicType === 'latest'
                    ? visualizationType === 'monitoring'
                        ? monitoringEnd
                        : monitoringStart
                    : undefined,
                fromDate: mosaicType === 'latest'
                    ? undefined
                    : visualizationType === 'monitoring'
                        ? monitoringStart
                        : calibrationStart,
                toDate: mosaicType === 'latest'
                    ? undefined
                    : visualizationType === 'monitoring'
                        ? monitoringEnd
                        : monitoringStart
            },
        }
    }
    return radarVisualizationOptions(radarRecipe)
}

const toPlanetVisualizations = () => {
    const planetRecipe = {}
    return planetVisualizationOptions(planetRecipe)
}

const getChangeVisualizations = recipe => {
    const {
        monitoringEnd,
        monitoringDuration, monitoringDurationUnit,
        calibrationDuration, calibrationDurationUnit
    } = selectFrom(recipe, 'model.date')
    const monitoringStart = moment(monitoringEnd, DATE_FORMAT).subtract(monitoringDuration, monitoringDurationUnit).format(DATE_FORMAT)
    const calibrationStart = moment(monitoringStart, DATE_FORMAT).subtract(calibrationDuration, calibrationDurationUnit).format(DATE_FORMAT)
    const fractionalMonitoringEnd = toFractionalYear(monitoringEnd)
    const fractionalCalibrationStart = toFractionalYear(calibrationStart)
    const toOptions = visualizations => visualizations
        .map(visParams => {
            const band = visParams.bands[0]
            return {value: band, label: band, visParams}
        })

    return [{
        label: msg('process.changeAlerts.layers.imageLayer.changes'),
        options: toOptions([
            normalize({
                type: 'continuous',
                bands: ['confidence'],
                min: [0],
                max: [10],
                palette: ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00', '#79C900', '#006400']
            }),
            normalize({
                type: 'continuous',
                bands: ['difference'],
                min: [-5000],
                max: [5000],
                palette: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#ffffff', '#a6d96a', '#66bd63', '#1a9850', '#006837']
            }),
            normalize({
                type: 'continuous',
                bands: ['detection_count'],
                min: [0],
                max: [15],
                palette: ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00', '#79C900', '#006400']
            })
        ])
    },
    {
        label: msg('process.changeAlerts.layers.imageLayer.dates'),
        options: toOptions([
            normalize({
                type: 'continuous',
                bands: ['last_stable_date'],
                dataType: 'fractionalYear',
                min: [fractionalCalibrationStart],
                max: [fractionalMonitoringEnd],
                palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
            }),
            normalize({
                type: 'continuous',
                bands: ['first_detection_date'],
                dataType: 'fractionalYear',
                min: [fractionalCalibrationStart],
                max: [fractionalMonitoringEnd],
                palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
            }),
            normalize({
                type: 'continuous',
                bands: ['confirmation_date'],
                dataType: 'fractionalYear',
                min: [fractionalCalibrationStart],
                max: [fractionalMonitoringEnd],
                palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
            }),
            normalize({
                type: 'continuous',
                bands: ['last_detection_date'],
                dataType: 'fractionalYear',
                min: [fractionalCalibrationStart],
                max: [fractionalMonitoringEnd],
                palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
            })
        ])
    },
    {
        label: msg('process.changeAlerts.layers.imageLayer.observations'),
        options: toOptions([
            normalize({
                type: 'continuous',
                bands: ['monitoring_observation_count'],
                min: [0],
                max: [15],
                palette: ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00', '#79C900', '#006400']
            }),
            normalize({
                type: 'continuous',
                bands: ['calibration_observation_count'],
                min: [0],
                max: [15],
                palette: ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00', '#79C900', '#006400']
            })
        ])
    }
    ]
}

