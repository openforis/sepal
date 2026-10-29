import {effectiveSettings, NOT_RECORDED, REFERENCE_FIELDS, UNUSED_FIELDS} from '#sepal/recipe/bayts/processing'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/baytsAlerts'
import {msg} from '~/translate'

import {presentedInput, preservedCopies, processingOfEvidence} from '../referenceProcessing'

// PRC's view of what BAYTS Alerts monitors with (#sepal/recipe/bayts/processing): the reference's geometric correction
// and spatial speckle filtering, read-only where it is known, beside the alerts' own passes, masks and angles. Nothing
// here writes into the saved recipe.
export const processingOf = recipe => processingOfEvidence(recipe, PRIMARY_IMAGE)

export const settingsOf = recipe => effectiveSettings(recipe.model, processingOf(recipe))

const STRONG_SCATTERER_VALUES = ['strongScattererValue1', 'strongScattererValue2']

export const presentProcessingInputs = settings => (inputs, modelToValues) => {
    const effective = modelToValues(Object.fromEntries(Object.entries(settings.fields).map(([key, fact]) => [key, fact.value])))
    return Object.fromEntries(Object.entries(inputs).map(([name, input]) => {
        const fact = settings.fields[STRONG_SCATTERER_VALUES.includes(name) ? 'strongScattererValues' : name]
        return [name, fact
            ? presentedInput({input, facts: [fact], referenceValue: effective[name], labelOf: processingLabel})
            : input]
    }))
}

// What an editable setting the alerts saved no value for starts from in PRC, by form input: the value monitoring takes
// for it (effectiveSettings), so that what is shown is what runs.
export const unrecordedValues = settings => Object.fromEntries(Object.entries(settings.fields)
    .filter(([, fact]) => fact.state === NOT_RECORDED)
    .flatMap(([field, {value}]) => field === 'strongScattererValues'
        ? STRONG_SCATTERER_VALUES.map((name, index) => [name, value[index]])
        : [[field, value]]))

// Applying PRC keeps what the alerts do not own - the reference's processing - and what they never read as it was
// saved, absent keys included: the panel serializes every field it holds, shown or not.
export const preserveProcessingCopies = settings => (next, previous = {}) =>
    preservedCopies({...previous, ...next}, previous, [
        ...UNUSED_FIELDS,
        ...REFERENCE_FIELDS.filter(key => settings.fields[key].state !== NOT_RECORDED)
    ])

export const processingLabel = state => msg(`process.baytsAlerts.processing.${state}`)
