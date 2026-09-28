import moment from 'moment'

import {hasMonitoringDates, monitoringDates} from '#sepal/recipe/changeAlerts/monitoringDates'
import {mosaicRecipe} from '#sepal/recipe/changeAlerts/mosaicRecipe'
import {visualizationOptions as opticalVisualizationOptions} from '~/app/home/body/process/recipe/opticalMosaic/visualizations'
import {visualizationOptions as planetVisualizationOptions} from '~/app/home/body/process/recipe/planetMosaic/visualizations'
import {visualizationOptions as radarVisualizationOptions} from '~/app/home/body/process/recipe/radarMosaic/visualizations'
import {normalize} from '~/app/home/map/visParams/visParams'
import {msg} from '~/translate'

const DATE_FORMAT = 'YYYY-MM-DD'

// Which helper presents a mosaic, keyed by the recipe type its projection names.
const MOSAIC_VISUALIZATIONS = {
    MOSAIC: opticalVisualizationOptions,
    RADAR_MOSAIC: radarVisualizationOptions,
    PLANET_MOSAIC: planetVisualizationOptions
}

export const getPreSetVisualizations = recipe => getChangeVisualizations(recipe)
    .map(({options}) => options.map(({visParams}) => visParams))
    .flat()

const toFractionalYear = date => {
    const year = moment(date).get('year')
    const startOfYear = moment(date, DATE_FORMAT).startOf(year)
    const startOfNextYear = moment(startOfYear).add(1, 'years')
    const dayOfYear = moment(date).dayOfYear()
    const daysInYear = moment(startOfNextYear).diff(moment(startOfYear), 'days')
    const fraction = dayOfYear / daysInYear
    return year + fraction
}

export const visualizationOptions = (recipe, visualizationType, mosaicType) => {
    return visualizationType === 'changes'
        ? getChangeVisualizations(recipe)
        : getMosaicVisualizations(recipe, visualizationType, mosaicType)
}

// A mosaic mode presents the mosaic Earth Engine builds around the monitoring dates, so its options come
// from the same projection the executor builds it from. Only the layer form of an initialized recipe asks
// for a mosaic mode, and an initialized recipe states its dates.
const getMosaicVisualizations = (recipe, visualizationType, mosaicType) => {
    const mosaic = mosaicRecipe({model: recipe.model, period: visualizationType, mosaicType})
    const visualizations = mosaic && MOSAIC_VISUALIZATIONS[mosaic.type]
    return visualizations ? visualizations(mosaic) : []
}

// The change bands are presented over the period they cover, so a recipe stating none yet is presented with
// nothing rather than failing for whoever consumes its output.
const getChangeVisualizations = recipe => {
    if (!hasMonitoringDates(recipe.model)) {
        return []
    }
    const {monitoringEnd, calibrationStart} = monitoringDates(recipe.model)
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
                dataType: 'fractionalYears',
                min: [fractionalCalibrationStart],
                max: [fractionalMonitoringEnd],
                palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
            }),
            normalize({
                type: 'continuous',
                bands: ['first_detection_date'],
                dataType: 'fractionalYears',
                min: [fractionalCalibrationStart],
                max: [fractionalMonitoringEnd],
                palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
            }),
            normalize({
                type: 'continuous',
                bands: ['confirmation_date'],
                dataType: 'fractionalYears',
                min: [fractionalCalibrationStart],
                max: [fractionalMonitoringEnd],
                palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
            }),
            normalize({
                type: 'continuous',
                bands: ['last_detection_date'],
                dataType: 'fractionalYears',
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
