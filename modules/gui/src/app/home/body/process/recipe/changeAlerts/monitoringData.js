import {observedMeasures} from '#sepal/recipe/changeAlerts/monitoringMeasures'
import {getDataSetOptions as opticalDataSetOptions} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {getDataSetOptions as planetDataSetOptions} from '~/app/home/body/process/recipe/planetMosaic/sources'
import {getDataSetOptions as radarDataSetOptions} from '~/app/home/body/process/recipe/radarMosaic/sources'

import {settingsOf} from './processingSettings'

// The data Change Alerts monitors, chosen in Sources: a type, and data sets of that type. The bands it observes are
// the shared native monitoring catalogue; display options retain their existing widgets.

export {availableMeasures, monitorableMeasures, MONITORING_TYPES, observedMeasures} from '#sepal/recipe/changeAlerts/monitoringMeasures'

// The data sets Sources offers for a type, over the monitoring dates.
export const dataSetOptions = (type, dates = {}) => {
    switch (type) {
        case 'OPTICAL': return opticalDataSetOptions(dates)
        case 'RADAR': return radarDataSetOptions(dates)
        case 'PLANET': return planetDataSetOptions(dates)
        default: return []
    }
}

// The bands a pixel chart's observations show: those the monitoring data chosen observes, none before any is chosen.
export const observedBands = recipe => (settingsOf(recipe).model && observedMeasures(settingsOf(recipe).model)) || []
