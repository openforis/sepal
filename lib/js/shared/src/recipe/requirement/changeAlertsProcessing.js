import {CCDC_SEGMENTS} from '../capability/ccdcSegments.js'
import {effectiveSettings, UNREADABLE, UNREADABLE_PROCESSING} from '../changeAlerts/processing.js'
import {NEEDS_EVIDENCE, SUPPORTED, unsupported} from './verdict.js'

export const CHANGE_ALERTS_PROCESSING = {
    id: 'changeAlerts.processing',
    capability: CCDC_SEGMENTS,
    evaluate: (processing, {model} = {}) => {
        if (!processing) {
            return {status: NEEDS_EVIDENCE}
        }
        const effective = effectiveSettings(model, processing)
        const fields = [...(processing.defaultsState === UNREADABLE ? ['sources'] : []), ...Object.entries(effective.fields).filter(([, fact]) => fact.state === UNREADABLE).map(([field]) => field)]
        if (!fields.length && effective.model && model?.reference?.type === 'ASSET' && ![0, 1, 2].includes(effective.fields.dateFormat.value)) {
            return unsupported({code: 'REFERENCE_DATE_FORMAT_REQUIRED'})
        }
        return fields.length ? unsupported({code: UNREADABLE_PROCESSING, fields})
            : effective.model ? {status: SUPPORTED} : {status: NEEDS_EVIDENCE}
    }
}
