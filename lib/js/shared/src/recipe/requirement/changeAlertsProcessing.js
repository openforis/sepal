import {effectiveSettings, UNREADABLE, UNREADABLE_PROCESSING} from '../changeAlerts/processing.js'
import {NEEDS_EVIDENCE, SUPPORTED, unsupported} from './verdict.js'

export const REFERENCE_DATE_FORMAT_REQUIRED = 'REFERENCE_DATE_FORMAT_REQUIRED'

// What Change Alerts needs of the processing its reference's segments were fitted under (changeAlerts/processing.js):
// readable, and for a segments asset, dates in a representation it records or the reference states. Change Alerts'
// readiness judges it over the processing the reference's description establishes (type/changeAlerts.js), and execution
// over the processing it reads itself (lib/js/ee/src/timeSeries/segmentSource.js).
export const CHANGE_ALERTS_PROCESSING = {
    id: 'changeAlerts.processing',
    evaluate: (processing, {model} = {}) => {
        if (!processing) {
            return {status: NEEDS_EVIDENCE}
        }
        const effective = effectiveSettings(model, processing)
        const fields = [...(processing.defaultsState === UNREADABLE ? ['sources'] : []), ...Object.entries(effective.fields).filter(([, fact]) => fact.state === UNREADABLE).map(([field]) => field)]
        if (!fields.length && effective.model && model?.reference?.type === 'ASSET' && ![0, 1, 2].includes(effective.fields.dateFormat.value)) {
            return unsupported({code: REFERENCE_DATE_FORMAT_REQUIRED})
        }
        return fields.length ? unsupported({code: UNREADABLE_PROCESSING, fields})
            : effective.model ? {status: SUPPORTED} : {status: NEEDS_EVIDENCE}
    }
}
