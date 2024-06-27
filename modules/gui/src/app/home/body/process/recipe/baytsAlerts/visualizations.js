import moment from 'moment'

import {getPreSetVisualizations as getPreSetRadarMosaicVisualizations, visualizationOptions as radarVisualizationOptions} from '~/app/home/body/process/recipe/radarMosaic/visualizations'
import {normalize} from '~/app/home/map/visParams/visParams'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

const DATE_FORMAT = 'YYYY-MM-DD'

export const getPreSetVisualizations = recipe =>
    ([
        ...getPreSetRadarMosaicVisualizations(recipe),
        ...Object.values(toAlertVisualiaztions(recipe))
    ])

export const visualizationOptions = (recipe, visualizationType) => {
    return !visualizationType || visualizationType === 'alerts'
        ? alertVisualizationOptions(recipe)
        : radarVisualizationOptions(recipe)
}

const alertVisualizationOptions = recipe => {
    const toOptions = visualizations => visualizations
        .map(visParams => {
            const band = visParams.bands[0]
            return {value: band, label: band, visParams}
        })

    const alertVisualizations = toAlertVisualiaztions(recipe)

    return [
        {
            label: msg('process.changeAlerts.layers.imageLayer.changes'),
            options: toOptions([alertVisualizations['change_probability'], alertVisualizations['flag']])
        },
        {
            label: msg('process.changeAlerts.layers.imageLayer.dates'),
            options: toOptions([alertVisualizations['first_detection_date'], alertVisualizations['confirmation_date']])
        },
    ]
}

const toAlertVisualiaztions = recipe => {
    const {monitoringEnd, monitoringDuration, monitoringDurationUnit} = selectFrom(recipe, 'model.date')
    const monitoringStart = moment(monitoringEnd, DATE_FORMAT).subtract(monitoringDuration, monitoringDurationUnit)
    const maxDays = 90 // TODO: Pick it up from recipe
    // const fractionalStart = moment(monitoringStart).subtract(monitoringDuration, monitoringDurationUnit).format(DATE_FORMAT)
    const fractionalMin = toFractionalYear(moment(monitoringStart.subtract(maxDays, 'days')))
    const fractionalMax = toFractionalYear(monitoringEnd)

    return {
        'change_probability': normalize({
            type: 'continuous',
            bands: ['change_probability'],
            min: [0],
            max: [1],
            palette: ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00', '#79C900', '#006400']
        }),
        'flag': normalize({
            type: 'categorical',
            bands: ['flag'],
            min: 0,
            max: 3,
            values: [0, 1, 2, 3],
            labels: ['Unflagged', 'Initial detection', 'Low-conf detection', 'High-conf detection'],
            palette: ['#000000', '#042333', '#b15f82', '#e8fa5b']
        }),
        'first_detection_date': normalize({
            type: 'continuous',
            bands: ['first_detection_date'],
            dataType: 'fractionalYears',
            min: [fractionalMin],
            max: [fractionalMax],
            palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
        }),
        'confirmation_date': normalize({
            type: 'continuous',
            bands: ['confirmation_date'],
            dataType: 'fractionalYears',
            min: [fractionalMin],
            max: [fractionalMax],
            palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
        })
    }
}

const toFractionalYear = date => {
    const year = moment(date).get('year')
    const startOfYear = moment(date, DATE_FORMAT).startOf(year)
    const startOfNextYear = moment(startOfYear).add(1, 'years')
    const dayOfYear = moment(date).dayOfYear()
    const daysInYear = moment(startOfNextYear).diff(moment(startOfYear), 'days')
    const fraction = dayOfYear / daysInYear
    return year + fraction
}

