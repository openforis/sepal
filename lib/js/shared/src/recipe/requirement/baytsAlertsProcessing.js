import {effectiveSettings, UNREADABLE, UNREADABLE_PROCESSING} from '../bayts/processing.js'
import {BAYTS_HISTORICAL_STATS} from '../capability/baytsHistoricalStats.js'
import {NEEDS_EVIDENCE, SUPPORTED, unsupported} from './verdict.js'

// What BAYTS Alerts monitors with needs the reference's processing (bayts/processing.js): read, and readable. Unknown
// while it is read, or where it could not be; refused where what records it cannot be read.
export const BAYTS_ALERTS_PROCESSING = {
    id: 'baytsAlerts.processing',
    capability: BAYTS_HISTORICAL_STATS,
    evaluate: (processing, {model} = {}) => {
        if (!processing) {
            return {status: NEEDS_EVIDENCE}
        }
        const effective = effectiveSettings(model, processing)
        const fields = Object.entries(effective.fields)
            .filter(([, fact]) => fact.state === UNREADABLE)
            .map(([field]) => field)
        return fields.length ? unsupported({code: UNREADABLE_PROCESSING, fields})
            : effective.model ? {status: SUPPORTED} : {status: NEEDS_EVIDENCE}
    }
}
