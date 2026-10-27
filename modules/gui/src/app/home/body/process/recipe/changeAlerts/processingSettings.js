import {effectiveSettings, PENDING, PROCESSING_FIELDS, UNAVAILABLE} from '#sepal/recipe/changeAlerts/processing'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'
import {msg} from '~/translate'

import {selectedSourceOf, sourceKeyOf} from '../sourceEvidence'

// Presentation reads the observation the runtime maintains for this selection. Submission uses SourceCandidate's
// current owner/basis check as well; none of these reads write effective settings into the saved consumer.
export const processingOf = recipe => {
    const evidence = recipe?.ui?.sourceEvidence
    return evidence?.sourceKey === sourceKeyOf(selectedSourceOf(recipe, PRIMARY_IMAGE))
        ? evidence.status === 'OBSERVED' ? evidence.processing || {state: PENDING}
            : {state: evidence.status === UNAVAILABLE ? UNAVAILABLE : PENDING}
        : {state: PENDING}
}

export const settingsOf = recipe => effectiveSettings(recipe.model, processingOf(recipe))

// The controls see current reference values, but the form retains its own draft and serialization. Read-only
// inputs swallow widget normalisation too (some choice widgets remove unavailable choices on update).
export const presentProcessingInputs = settings => (inputs, modelToValues) => {
    const effective = modelToValues({
        ...Object.fromEntries(Object.entries(settings.fields).map(([key, fact]) => [key, fact.value])),
        corrections: ['SR', 'BRDF'].filter(key => settings.fields[key].value),
        strongScattererValues: settings.fields.strongScattererValues.value
    })
    return Object.fromEntries(Object.entries(inputs).map(([name, input]) => {
        const key = ['strongScattererValue1', 'strongScattererValue2'].includes(name) ? 'strongScattererValues' : name
        const facts = name === 'corrections' ? ['SR', 'BRDF'].map(key => settings.fields[key]) : [settings.fields[key]]
        if (facts.some(fact => !fact)) {
            return [name, input]
        }
        const editable = facts.some(fact => fact.state === 'NOT_RECORDED')
        const status = facts.every(fact => fact.state === 'NOT_RECORDED') ? 'NOT_RECORDED'
            : facts.find(fact => fact.state !== 'NOT_RECORDED').state
        const value = name === 'corrections'
            ? ['SR', 'BRDF'].filter((key, index) => facts[index].state === 'NOT_RECORDED' ? input.value?.includes(key) : facts[index].value)
            : editable ? input.value : ['REFERENCE', 'RECORDED'].includes(status) ? effective[name] : undefined
        const update = (method, value) => {
            if (!editable) {
                return
            }
            input[method](name === 'corrections'
                ? ['SR', 'BRDF'].filter((key, index) => facts[index].state === 'NOT_RECORDED' ? value?.includes(key) : input.value?.includes(key))
                : value)
        }
        return [name, {...input, value, set: value => update('set', value), setInitialValue: value => update('setInitialValue', value),
            handleChange: event => update('set', event.target.value),
            referenceOwned: !editable,
            disabledValues: name === 'corrections' ? ['SR', 'BRDF'].filter((key, index) => facts[index].state !== 'NOT_RECORDED') : undefined,
            optionTooltip: name === 'corrections' ? (key, text) => `${text} — ${processingLabel(settings.fields[key].state)}` : undefined,
            presentation: (label, tooltip) => ({disabled: !editable, readOnly: !editable, label,
                tooltip: [tooltip, processingLabel(editable && status !== 'NOT_RECORDED' ? 'MIXED' : status)].filter(Boolean)})
        }]
    }))
}

// Applying another control must preserve saved copies, including absent keys, rather than serialize display values
// or a shared PRC form's default for a field that this consumer does not own.
export const preserveProcessingCopies = settings => (next, previous = {}) => {
    const result = {...previous, ...next}
    // The time-series collection does not read the legacy strongScatterers toggle; its hidden copy stays untouched.
    const keys = [...PROCESSING_FIELDS.filter(key => !['SR', 'BRDF', 'dateFormat'].includes(key)), 'strongScatterers', 'corrections']
    keys.filter(key => key === 'corrections' ? false : settings.fields[key]?.state !== 'NOT_RECORDED').forEach(key => {
        if (Object.prototype.hasOwnProperty.call(previous, key)) {
            result[key] = previous[key]
        } else {
            delete result[key]
        }
    })
    const corrected = ['SR', 'BRDF'].filter(key => settings.fields[key].state !== 'NOT_RECORDED')
    if (corrected.length === 2) {
        if (Object.prototype.hasOwnProperty.call(previous, 'corrections')) {
            result.corrections = previous.corrections
        } else {
            delete result.corrections
        }
    } else if (corrected.length) {
        result.corrections = [...(next.corrections || []).filter(key => !corrected.includes(key)),
            ...(previous.corrections || []).filter(key => corrected.includes(key))]
    }
    return result
}

export const processingLabel = state => msg(`process.changeAlerts.processing.${state}`)
