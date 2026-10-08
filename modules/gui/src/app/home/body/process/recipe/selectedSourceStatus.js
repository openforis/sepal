import _ from 'lodash'

import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {
    CHECKED,
    CYCLIC_SOURCE,
    EXPIRED,
    MISSING_SOURCE,
    NOT_A_PRODUCER,
    readLocalRequirements,
    readSourceRequirements,
    SUPPORTED,
    UNAVAILABLE,
    UNFILLED_ROLE,
    UNSUPPORTED
} from './sourceRequirements'

// What a recipe's source section says about the requirements declared for it (sourceRequirements.js): null when there is
// nothing to say, otherwise {selected, state, message, details, refresh, advisories}.
//
// `state` is what holds the section back, from the requirements its selection must meet - a refusal before unavailable
// or expired evidence before checking - with a short `message`, every problem behind it in `details`, and `refresh`
// when reading the source again may help; null when nothing does. A section that does not select the source, but
// configures something that depends on it, is held back only by what is established about that setting: whether the
// source can be read is the section that selects it's to say. `advisories` [{message}] are the
// other problems established about the same source, each said apart so none hides what holds the section back: those of
// a requirement its selection need not meet - one only an operation needs - each by what it says; and, where nothing
// holds the section back, one naming the other sections whose settings no longer suit it, which say why themselves -
// those whose requirements name this section to advise (`advise`). A section no requirement names advises of none.
//
// Names come from the recipe listing and types from their registered labels; what a requirement's own diagnoses say is
// the requirement's (`describe`). A source not selected yet is the form's to require, not something for its section to
// report before anyone touched it.
//
// A requirement over the recipe's own configuration (a local read, sourceRequirements.js) holds its section back with
// `UNMET_CONFIGURATION` by what it finds itself, each item's diagnosis named by the item. A read held only by its
// prerequisites marks its item (itemStatusesOf), naming them, and holds its section back too, by that short summary
// alone: what is wrong is said where it is, but a section with an item that cannot be used is not shown as sound.
export const CHECKING_SOURCE = 'CHECKING_SOURCE'
export const UNAVAILABLE_SOURCE = 'UNAVAILABLE_SOURCE'
export const UNSUITABLE_SOURCE = 'UNSUITABLE_SOURCE'
export const UNMET_CONFIGURATION = 'UNMET_CONFIGURATION'

export const selectedSourceStatusOfState = (state, recipeId, sectionId, evidenceOwnerOf, now = Date.now()) =>
    sectionStatusOf(state, readsOf(state, recipeId, evidenceOwnerOf, now), sectionId)

// The same, over reads the caller made - of a selection being edited, say.
export const sectionStatusOf = (state, reads, sectionId) => {
    const sourceStatus = selectedStatusOf(state, reads.filter(({local}) => !local), sectionId)
    return sourceStatus?.state
        ? sourceStatus
        : configurationStatusOf(reads, sectionId) || sourceStatus
}

// What each item of a section its local requirements enumerate says, where anything does: {[itemId]: status}.
export const itemStatusesOf = (reads, sectionId) => Object.fromEntries(reads
    .filter(read => read.local && read.item && read.declaration.section.id === sectionId)
    .map(read => [read.item.id, localStatusOf(read)])
    .filter(([_id, status]) => status))

export const itemStatusesOfState = (state, recipeId, sectionId) => {
    const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
    return recipe ? itemStatusesOf(readLocalRequirements(recipe), sectionId) : {}
}

const selectedStatusOf = (state, reads, sectionId) => {
    const own = reads.filter(({declaration}) => declaration.section.id === sectionId)
    if (!own.some(({selected}) => selected)) {
        return null
    }
    const names = recipeNames(state)
    const blocking = own.filter(isRequired)
        .map(read => statusOf(read, names))
        .filter(Boolean)
        .sort((a, b) => PRECEDENCE.indexOf(a.state) - PRECEDENCE.indexOf(b.state))[0]
    const advising = reads.filter(read => read.declaration.section.id !== sectionId && isRequired(read)
        && read.declaration.advise?.includes(sectionId))
    const advisories = [
        ...operationAdvisories(own.filter(read => !isRequired(read)), blocking, names),
        ...blocking ? [] : sectionAdvisories(advising, names)
    ]
    if (!blocking && !advisories.length) {
        return null
    }
    return blocking
        ? {...blocking, advisories}
        : {selected: own.find(({selected}) => selected).selected, state: null, message: null, details: [], refresh: false, advisories}
}

// What a consumer of an operation over a recipe, wherever the recipe is shown, says about the requirement holding that
// operation (`requestGate`): null when none holds it, otherwise {state, recipe, section} - the recipe's name and the
// section to review in it. Why is that section's to say, in the recipe. A source not selected holds it as much as an
// unsuitable one.
export const heldSourceStatusOfState = (state, recipe, gate) => {
    if (!gate) {
        return null
    }
    const names = recipeNames(state)
    const status = statusOf(gate.read, names)
    return status && {
        state: status.state,
        recipe: names[recipe.id] || recipe.title || recipe.placeholder || recipe.id,
        section: msg(gate.section)
    }
}

// The sections held back by an unavailable or unsuitable source, or by their own configuration, and why:
// {[sectionId]: message}. An advisory marks nothing.
export const sourceProblemsOfState = (state, recipeId, evidenceOwnerOf, now = Date.now()) => {
    const reads = readsOf(state, recipeId, evidenceOwnerOf, now)
    return Object.fromEntries(_.uniq(reads.map(({declaration}) => declaration.section.id))
        .map(section => [section, sectionStatusOf(state, reads, section)])
        .filter(([_section, status]) => [UNAVAILABLE_SOURCE, UNSUITABLE_SOURCE, UNMET_CONFIGURATION].includes(status?.state))
        .map(([section, {message}]) => [section, message]))
}

const readsOf = (state, recipeId, evidenceOwnerOf, now) => {
    const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
    return recipe ? readSourceRequirements({state, recipe, evidenceOwnerOf, now}) : []
}

const PRECEDENCE = [UNSUITABLE_SOURCE, UNAVAILABLE_SOURCE, CHECKING_SOURCE]

// What is wrong with the selection itself - nothing it selects provides the capability - is said once, by what holds the
// section back.
const operationAdvisories = (reads, blocking, names) => reads
    .map(read => [unsuitable(read, names), operationLabel(read.declaration)])
    .filter(([status]) => status)
    .filter(([{message}], index, all) => message !== blocking?.message && all.findIndex(([other]) => other.message === message) === index)
    .map(([{message}, about]) => ({message: msg('process.source.status.advisory', {about, message})}))

const sectionAdvisories = (reads, names) => {
    const sections = _.uniq(reads.filter(read => unsuitable(read, names)).map(({declaration}) => msg(declaration.section.label)))
    return sections.length
        ? [{message: msg('process.source.status.sectionsIncompatible', {sections: sections.join(', ')})}]
        : []
}

const unsuitable = (read, names) => {
    const status = statusOf(read, names)
    return status?.state === UNSUITABLE_SOURCE ? status : null
}

const isRequired = ({declaration}) => declaration.requiredForSelection !== false

const operationLabel = ({operations = []}) =>
    msg(`process.source.operation.${operations[0]}`)

// What the section's local requirements find, the first item named, and every one in `details`: what they find
// themselves before what holds them only by their prerequisites, which is said by the prerequisites' names alone.
const configurationStatusOf = (reads, sectionId) => {
    const unmet = reads.filter(read => read.local && read.declaration.section.id === sectionId && read.verdict.status === UNSUPPORTED)
    const problems = [
        ...unmet.filter(read => read.ownVerdict.status === UNSUPPORTED).map(read => ({read, ...ownDiagnosis(read)})),
        ...unmet.filter(read => read.ownVerdict.status !== UNSUPPORTED)
            .map(read => ({read, message: prerequisitesMessage(read), details: []}))
    ]
        .map(({read, message, details}) => read.item
            ? {message: msg('process.requirement.itemProblem', {item: read.item.label, message}), details}
            : {message, details})
    return problems.length
        ? {
            state: UNMET_CONFIGURATION,
            message: problems[0].message,
            details: [...problems[0].details, ...problems.slice(1).map(({message}) => message)],
            refresh: false,
            advisories: []
        }
        : null
}

// What a local read says: its own diagnosis, followed by the prerequisites it waits on, named - not by what they say.
const localStatusOf = read => {
    if (read.verdict.status === SUPPORTED) {
        return null
    }
    const own = read.ownVerdict.status === UNSUPPORTED ? ownDiagnosis(read) : null
    const prerequisites = read.unmetPrerequisites.length ? prerequisitesMessage(read) : null
    return {
        state: UNMET_CONFIGURATION,
        message: own ? own.message : prerequisites,
        details: own ? [...own.details, ...(prerequisites ? [prerequisites] : [])] : [],
        refresh: false,
        advisories: []
    }
}

const prerequisitesMessage = ({unmetPrerequisites}) =>
    msg('process.requirement.prerequisiteUnmet', {items: unmetPrerequisites.map(({label, item}) => label || item).join(', ')})

const ownDiagnosis = ({ownVerdict, declaration}) =>
    declaration.requirement.describe(ownVerdict.diagnostic)

const statusOf = (read, names) => {
    if (read.local) {
        return localStatusOf(read)
    }
    const {selected, selects, acquisition, verdict, declaration, assetId, missing} = read
    if (verdict.status === SUPPORTED || (!selects && verdict.status !== UNSUPPORTED)) {
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
