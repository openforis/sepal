import {observedMeasures} from '#sepal/recipe/changeAlerts/monitoringMeasures'

import {settingsOf} from './processingSettings'

// The data Change Alerts monitors, chosen in Sources: a type, and data sets of that type. The bands it observes are
// the shared native monitoring catalogue; display options retain their existing widgets.

export {availableMeasures, monitorableMeasures, MONITORING_TYPES, observedMeasures} from '#sepal/recipe/changeAlerts/monitoringMeasures'

// The bands a pixel chart's observations show: those the monitoring data chosen observes, none before any is chosen.
export const observedBands = recipe => (settingsOf(recipe).model && observedMeasures(settingsOf(recipe).model)) || []
