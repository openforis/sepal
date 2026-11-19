import {NON_POSITIVE_DURATION} from '#sepal/recipe/type/changeAlerts'
import {msg} from '~/translate'

import {fieldRequirement} from '../requirements/fieldRequirement'

const DATES = {id: 'date', label: 'process.changeAlerts.panel.date.button'}

// A window of the period that does not last (NON_POSITIVE_DURATION, type/changeAlerts.js), said on Dates' toolbar button
// for a period saved so. The Dates form refuses one itself, in the same words.
export const dateRequirements = [
    fieldRequirement({
        id: 'date.monitoringDuration',
        section: DATES,
        code: NON_POSITIVE_DURATION,
        path: ['model', 'date', 'monitoringDuration'],
        message: () => msg('process.changeAlerts.panel.date.form.monitoring.duration.positive')
    }),
    fieldRequirement({
        id: 'date.calibrationDuration',
        section: DATES,
        code: NON_POSITIVE_DURATION,
        path: ['model', 'date', 'calibrationDuration'],
        message: () => msg('process.changeAlerts.panel.date.form.calibration.duration.positive')
    })
]
