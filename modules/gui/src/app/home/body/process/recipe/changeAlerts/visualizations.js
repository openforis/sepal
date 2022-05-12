import {normalize} from 'app/home/map/visParams/visParams'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

const toFractionalYear = date => {
    const startOfYear = moment(date, DATE_FORMAT).startOf(year)
    const startOfNextYear = moment(startOfYear).add(1, 'years')
    const dayOfYear = moment(date).dayOfYear()
    const daysInYear = moment(startOfNextYear).diff(moment(startOfYear), 'days')
    const fraction = (daysInYear - dayOfYear) / daysInYear
    const year = moment(date).get('year')
    return year + fraction
}

export const getPreSetVisualizations = recipe => {
    const date = recipe.model.date
    const monitoringEnd = date.monitoringEnd
    const monitoringStart = moment(monitoringEnd, DATE_FORMAT).subtract(date.monitoringDuration, date.monitoringDurationUnit).format(DATE_FORMAT)
    const calibrationStart = moment(monitoringStart, DATE_FORMAT).subtract(date.calibrationDuration, date.calibrationDurationUnit).format(DATE_FORMAT)
    const fractionalMonitoringEnd = toFractionalYear(monitoringEnd)
    const fractionalMonitoringStart = toFractionalYear(monitoringStart)
    const fractionalCalibrationStart = toFractionalYear(calibrationStart)

    return [
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
        }),
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
        }),
        normalize({
            type: 'continuous',
            bands: ['last_stable_date'],
            min: [calibrationStart],
            max: [monitoringEnd],
            palette: ['#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
        }),
        normalize({
            type: 'continuous',
            bands: ['first_detection_date'],
            min: [calibrationStart],
            max: [monitoringEnd],
            palette: ['#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
        }),
        normalize({
            type: 'continuous',
            bands: ['confirmation_date'],
            min: [calibrationStart],
            max: [monitoringEnd],
            palette: ['#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
        }),
        normalize({
            type: 'continuous',
            bands: ['last_detection_date'],
            min: [calibrationStart],
            max: [monitoringEnd],
            palette: ['#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
        })
    ]
}

