import moment from 'moment'

import {normalize} from '~/app/home/map/visParams/visParams'
import {selectFrom} from '~/stateUtils'

const DATE_FORMAT = 'YYYY-MM-DD'

// fcd_decision_map holds the first-change date as epoch milliseconds (see Q017),
// so its legend range is the recipe's monitoring window in ms. Same date ramp as changeAlerts.
const DATE_PALETTE = ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']

const toMillis = (date, fallback) => {
    const parsed = moment(date, DATE_FORMAT, true)
    return parsed.isValid() ? parsed.valueOf() : fallback
}

export const getPreSetVisualizations = recipe => {
    const monitoringStart = selectFrom(recipe, 'model.dates.monitoringStart')
    const monitoringEnd = selectFrom(recipe, 'model.dates.monitoringEnd')
    return [
        // total_changes is the per-pixel count of change detections across the monitoring
        // scenes; its true ceiling is ~the scene count, so this max is a sensible default
        // the user can raise in the visualization editor.
        normalize({
            type: 'continuous',
            bands: ['total_changes'],
            min: 0,
            max: 10,
            palette: ['#ffffbf', '#d7191c']
        }),
        normalize({
            type: 'continuous',
            bands: ['post_fcd_change_repeatability_pct'],
            min: 0,
            max: 100,
            palette: ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404']
        }),
        normalize({
            type: 'continuous',
            bands: ['fcd_decision_map'],
            min: toMillis(monitoringStart, 0),
            max: toMillis(monitoringEnd, 2000000000000),
            palette: DATE_PALETTE
        })
    ]
}
