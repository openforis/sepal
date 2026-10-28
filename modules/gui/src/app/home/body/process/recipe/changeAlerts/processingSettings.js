import {effectiveSettings, NOT_RECORDED, PROCESSING_FIELDS} from '#sepal/recipe/changeAlerts/processing'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'
import {msg} from '~/translate'

import {presentedInput, preservedCopies, processingOfEvidence} from '../referenceProcessing'

// Presentation reads the observation the runtime maintains for this selection. Submission uses SourceCandidate's
// current owner/basis check as well; none of these reads write effective settings into the saved consumer.
export const processingOf = recipe => processingOfEvidence(recipe, PRIMARY_IMAGE)

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
        const presented = presentedInput({input, facts, referenceValue: effective[name], labelOf: processingLabel})
        return [name, name === 'corrections' ? presentedCorrections(presented, input, facts, settings) : presented]
    }))
}

// Surface reflectance and BRDF correction share one control, each part owned apart: what the reference owns of it is
// shown as the reference's, what is the consumer's stays its draft.
const presentedCorrections = (presented, input, facts, settings) => {
    const owned = (index, value) => facts[index].state === NOT_RECORDED ? value : facts[index].value
    const update = (method, value) => {
        if (!presented.referenceOwned) {
            input[method](['SR', 'BRDF'].filter((key, index) => facts[index].state === NOT_RECORDED
                ? value?.includes(key)
                : input.value?.includes(key)))
        }
    }
    return {
        ...presented,
        value: ['SR', 'BRDF'].filter((key, index) => owned(index, input.value?.includes(key))),
        set: value => update('set', value),
        setInitialValue: value => update('setInitialValue', value),
        handleChange: event => update('set', event.target.value),
        disabledValues: ['SR', 'BRDF'].filter((key, index) => facts[index].state !== NOT_RECORDED),
        optionTooltip: (key, text) => `${text} — ${processingLabel(settings.fields[key].state)}`
    }
}

// Applying another control must preserve saved copies, including absent keys, rather than serialize display values
// or a shared PRC form's default for a field that this consumer does not own.
export const preserveProcessingCopies = settings => (next, previous = {}) => {
    // The time-series collection does not read the legacy strongScatterers toggle; its hidden copy stays untouched.
    const keys = [...PROCESSING_FIELDS.filter(key => !['SR', 'BRDF', 'dateFormat'].includes(key)), 'strongScatterers']
    const result = preservedCopies({...previous, ...next}, previous, keys.filter(key => settings.fields[key]?.state !== NOT_RECORDED))
    const corrected = ['SR', 'BRDF'].filter(key => settings.fields[key].state !== NOT_RECORDED)
    if (corrected.length === 2) {
        preservedCopies(result, previous, ['corrections'])
    } else if (corrected.length) {
        result.corrections = [...(next.corrections || []).filter(key => !corrected.includes(key)),
            ...(previous.corrections || []).filter(key => corrected.includes(key))]
    }
    return result
}

export const processingLabel = state => msg(`process.changeAlerts.processing.${state}`)
