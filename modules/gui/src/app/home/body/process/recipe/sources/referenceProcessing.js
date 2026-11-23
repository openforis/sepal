import {NOT_RECORDED, PENDING, RECORDED, REFERENCE, UNAVAILABLE} from '#sepal/recipe/referenceProcessing'

import {selectedSourceOf, sourceKeyOf} from './sourceEvidence'

// How a recipe's editors present processing settings it takes from the reference it monitors against
// (#sepal/recipe/referenceProcessing): which settings, and their wording, are each recipe's own.

// What the observation the runtime maintains established for the selection in `role`: pending while it is not that
// selection's or not yet answered, unavailable where it could not be read. Submission checks SourceCandidate's current
// owner and basis as well; nothing here writes into the saved recipe.
export const processingOfEvidence = (recipe, role) => {
    const evidence = recipe?.ui?.sourceEvidence
    return evidence?.sourceKey === sourceKeyOf(selectedSourceOf(recipe, role))
        ? evidence.status === 'OBSERVED' ? evidence.processing || {state: PENDING}
            : {state: evidence.status === UNAVAILABLE ? UNAVAILABLE : PENDING}
        : {state: PENDING}
}

// A form input bound to settings the reference may own (`facts`): its own draft where any of them is the consumer's to
// edit, otherwise the reference's value, read-only, the draft unchanged whatever the control is told - choice widgets
// normalise their values on update. `labelOf(state)` says where a value comes from.
export const presentedInput = ({input, facts, referenceValue, labelOf}) => {
    const editable = facts.some(({state}) => state === NOT_RECORDED)
    const status = facts.every(({state}) => state === NOT_RECORDED)
        ? NOT_RECORDED
        : facts.find(({state}) => state !== NOT_RECORDED).state
    const update = (method, value) => {
        if (editable) {
            input[method](value)
        }
    }
    return {
        ...input,
        value: editable ? input.value : [REFERENCE, RECORDED].includes(status) ? referenceValue : undefined,
        set: value => update('set', value),
        setInitialValue: value => update('setInitialValue', value),
        handleChange: event => update('set', event.target.value),
        referenceOwned: !editable,
        presentation: (label, tooltip) => ({
            disabled: !editable,
            readOnly: !editable,
            label,
            tooltip: [tooltip, labelOf(editable && status !== NOT_RECORDED ? 'MIXED' : status)].filter(Boolean)
        })
    }
}

// The saved values of `keys` as they were, absent ones staying absent: applying a form serializes every field it
// holds, including those the consumer does not own or does not use.
export const preservedCopies = (result, previous, keys) => {
    keys.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(previous, key)) {
            result[key] = previous[key]
        } else {
            delete result[key]
        }
    })
    return result
}
