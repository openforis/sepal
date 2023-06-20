import {getPreSetVisualizations as getPreSetRadarMosaicVisualizations, visualizationOptions as radarVisualizationOptions} from 'app/home/body/process/recipe/radarMosaic/visualizations'
import {msg} from 'translate'
import {normalize} from 'app/home/map/visParams/visParams'
import {selectFrom} from 'stateUtils'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const getPreSetVisualizations = recipe =>
    getPreSetRadarMosaicVisualizations(recipe)

export const visualizationOptions = (recipe, visualizationType) => {
    return !visualizationType || visualizationType === 'alerts'
        ? alertVisualizationOptions(recipe)
        : radarVisualizationOptions(recipe)
}

const alertVisualizationOptions = recipe => {
    const {monitoringEnd, monitoringDuration, monitoringDurationUnit} = selectFrom(recipe, 'model.date')
    const monitoringStart = moment(monitoringEnd, DATE_FORMAT).subtract(monitoringDuration, monitoringDurationUnit)
    const maxDays = 90 // TODO: Pick it up from recipe
    // const fractionalStart = moment(monitoringStart).subtract(monitoringDuration, monitoringDurationUnit).format(DATE_FORMAT)
    const fractionalMin = toFractionalYear(moment(monitoringStart.subtract(maxDays, 'days')))
    const fractionalMax = toFractionalYear(monitoringEnd)

    const toOptions = visualizations => visualizations
        .map(visParams => {
            const band = visParams.bands[0]
            return {value: band, label: band, visParams}
        })

    return [
        {
            label: msg('process.changeAlerts.layers.imageLayer.changes'),
            options: toOptions([
                normalize({
                    type: 'continuous',
                    bands: ['change_probability'],
                    min: [0],
                    max: [1],
                    palette: ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00', '#79C900', '#006400']
                }),
                normalize({
                    type: 'categorical',
                    bands: ['flag'],
                    min: 0,
                    max: 3,
                    values: [0, 1, 2, 3],
                    labels: ['Unflagged', 'Initial detection', 'Low-conf detection', 'High-conf detection'],
                    palette: ['#000000', '#042333', '#b15f82', '#e8fa5b']
                }),
            ])
        },
        {
            label: msg('process.changeAlerts.layers.imageLayer.dates'),
            options: toOptions([
                normalize({
                    type: 'continuous',
                    bands: ['first_detection_date'],
                    dataType: 'fractionalYears',
                    min: [fractionalMin],
                    max: [fractionalMax],
                    palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
                }),
                normalize({
                    type: 'continuous',
                    bands: ['confirmation_date'],
                    dataType: 'fractionalYears',
                    min: [fractionalMin],
                    max: [fractionalMax],
                    palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
                }),
            ])
        },
    ]
}

const toFractionalYear = date => {
    const startOfYear = moment(date, DATE_FORMAT).startOf(year)
    const startOfNextYear = moment(startOfYear).add(1, 'years')
    const dayOfYear = moment(date).dayOfYear()
    const daysInYear = moment(startOfNextYear).diff(moment(startOfYear), 'days')
    const fraction = dayOfYear / daysInYear
    const year = moment(date).get('year')
    return year + fraction
}

