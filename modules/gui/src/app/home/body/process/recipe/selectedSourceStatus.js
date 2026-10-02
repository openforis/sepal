import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {
    CHECKED,
    CYCLIC_SOURCE,
    EXPIRED,
    MISSING_SOURCE,
    NOT_A_PRODUCER,
    readSourceRequirements,
    SUPPORTED,
    UNAVAILABLE,
    UNFILLED_ROLE,
    UNSUPPORTED
} from './sourceRequirements'

// What a recipe's source section says about the source selected in it (sourceRequirements.js): null when there is
// nothing to say, otherwise {selected, state, message, details, refresh} - a short message, every problem behind it in
// `details`, and `refresh` when reading the source again may help. Names come from the recipe listing and types from
// their registered labels; what a requirement's own diagnoses say is the requirement's (`describe`). A source not selected yet is the form's to require, not something to report here
// before anyone touched it.
export const CHECKING_SOURCE = 'CHECKING_SOURCE'
export const UNAVAILABLE_SOURCE = 'UNAVAILABLE_SOURCE'
export const UNSUITABLE_SOURCE = 'UNSUITABLE_SOURCE'

export const selectedSourceStatusOfState = (state, recipeId, sectionId, evidenceOwnerOf, now = Date.now()) => {
    const read = readsOf(state, recipeId, evidenceOwnerOf, now).find(({declaration}) => declaration.section.id === sectionId)
    return read ? statusOf(read, recipeNames(state)) : null
}

// The sections whose selected source is unavailable or unsuitable, and why: {[sectionId]: message}.
export const sourceProblemsOfState = (state, recipeId, evidenceOwnerOf, now = Date.now()) => {
    const names = recipeNames(state)
    return Object.fromEntries(readsOf(state, recipeId, evidenceOwnerOf, now)
        .map(read => [read.declaration.section.id, statusOf(read, names)])
        .filter(([_section, status]) => [UNAVAILABLE_SOURCE, UNSUITABLE_SOURCE].includes(status?.state))
        .map(([section, {message}]) => [section, message]))
}

const readsOf = (state, recipeId, evidenceOwnerOf, now) => {
    const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
    return recipe ? readSourceRequirements({state, recipe, evidenceOwnerOf, now}) : []
}

const statusOf = (read, names) => {
    const {selected, acquisition, verdict, declaration, assetId, missing} = read
    if (!selected || verdict.status === SUPPORTED) {
        return null
    }
    const status = (state, message, refresh, details = []) => ({selected, state, message, details, refresh})
    if (verdict.status === UNSUPPORTED) {
        const {message, details} = diagnosis(verdict.diagnostic, declaration, names)
        return status(UNSUITABLE_SOURCE, message, false, details)
    }
    if (acquisition === UNAVAILABLE || acquisition === CHECKED) {
        return status(UNAVAILABLE_SOURCE, assetId
            ? msg(`process.source.status.${missing ? 'assetMissing' : 'assetUnavailable'}`, {asset: assetId})
            : msg('process.source.status.unavailable'), true)
    }
    return acquisition === EXPIRED
        ? status(UNAVAILABLE_SOURCE, msg('process.source.status.expired'), true)
        : status(CHECKING_SOURCE, msg('process.source.status.checking'), false)
}

const diagnosis = (diagnostic, declaration, names) => {
    const {capability, describe} = declaration.requirement
    const values = {
        way: (diagnostic.chain || []).map(({record}) => `${recordText(record, names)} → `).join(''),
        source: diagnostic.at?.record ? recordText(diagnostic.at.record, names) : '',
        capability: msg(capability.label)
    }
    const plain = message => ({message, details: []})
    switch (diagnostic.code) {
        case NOT_A_PRODUCER:
            return plain(msg('process.source.status.notAProducer', values))
        case UNFILLED_ROLE:
            return plain(msg('process.source.status.unfilledRole', values))
        case CYCLIC_SOURCE:
            return plain(msg('process.source.status.cyclic'))
        case MISSING_SOURCE:
            return plain(msg('process.source.status.missing'))
        default:
            return describe?.(diagnostic) || plain(msg('process.source.status.unsuitable', values))
    }
}

const recordText = (record, names) =>
    `${getRecipeType(record.type)?.labels?.name || record.type} '${names[record.id] || record.id}'`

const recipeNames = state =>
    Object.fromEntries((selectFrom(state, 'process.recipes') || []).map(({id, name}) => [id, name]))
