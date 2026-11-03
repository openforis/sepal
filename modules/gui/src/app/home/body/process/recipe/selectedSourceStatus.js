import _ from 'lodash'

import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {describeFeedback, feedbackMessage, joinFeedback, recipeReference} from './feedbackMessage'
import {
    CHECKED,
    CHECKING,
    CYCLIC_SOURCE,
    EXPIRED,
    MISSING_SOURCE,
    NOT_A_PRODUCER,
    readLocalRequirements,
    readOutputRequirementsOfState,
    readSourceRequirements,
    recipeNamesOf,
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
// `UNMET_CONFIGURATION` by what it finds itself, each item's diagnosis named by the item. A read held only by
// prerequisites in its own section marks its item (itemStatusesOf), naming them, and holds its section back too, by
// that short summary alone: what is wrong is said where it is, but a section with an item that cannot be used is not
// shown as sound. Prerequisites in another section are that section's to say: a read waiting on them marks nothing, not
// even what it finds itself, which is acted on once they are met - what it holds back stays held, naming the section the
// first unmet requirement lies in (sourceRequirements.js). Other reads of its section still say what they find.
//
// A diagnosis of work not done yet rather than of something wrong (`incomplete`, in the verdict's diagnostic) leaves its
// section `incomplete`: what is wrong is said first, and a section is incomplete only while nothing else is.
export const CHECKING_SOURCE = 'CHECKING_SOURCE'
export const UNAVAILABLE_SOURCE = 'UNAVAILABLE_SOURCE'
export const UNSUITABLE_SOURCE = 'UNSUITABLE_SOURCE'
export const UNMET_CONFIGURATION = 'UNMET_CONFIGURATION'

// `heldFor` is the source runtime's: a type whose requirements its output read judges needs it.
export const selectedSourceStatusOfState = (state, recipeId, sectionId, evidenceOwnerOf, now = Date.now(), heldFor) =>
    sectionStatusOf(state, readsOf(state, recipeId, evidenceOwnerOf, now, heldFor), sectionId)

// The same, over reads the caller made - of a selection being edited, say.
export const sectionStatusOf = (state, reads, sectionId) => {
    const sourceStatus = selectedStatusOf(state, reads.filter(({local}) => !local), sectionId)
    return sourceStatus?.state
        ? sourceStatus
        : configurationStatusOf(reads, sectionId) || sourceStatus
}

// What a section refuses a selection for, where its status is that refusal (UNSUITABLE_SOURCE): the diagnosis behind it,
// for an editor to say it beside the setting it concerns.
export const sectionRefusalOf = (state, reads, sectionId) =>
    sectionStatusOf(state, reads, sectionId)?.state === UNSUITABLE_SOURCE
        ? reads.find(read => !read.local && read.declaration.section.id === sectionId && isRequired(read)
            && read.verdict.status === UNSUPPORTED)?.verdict.diagnostic || null
        : null

// What each item of a section its local requirements enumerate, or its output read refuses, says, where anything does:
// {[itemId]: status}. An item several requirements find something of says each of them (itemStatusOf).
export const itemStatusesOf = (reads, sectionId) => _.mapValues(
    _.groupBy(reads
        .filter(read => read.local && read.item && read.declaration.section.id === sectionId)
        .map(read => ({id: read.item.id, status: localStatusOf(read)}))
        .filter(({status}) => status), 'id'),
    found => itemStatusOf(found.map(({status}) => status))
)

export const itemStatusesOfState = (state, recipeId, sectionId, heldFor) => {
    const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
    if (!recipe) {
        return NO_STATUSES
    }
    const local = readLocalRequirements(recipe)
    const output = readOutputRequirementsOfState({state, recipe, heldFor})
    const bySection = ITEM_STATUSES.get(output) || new Map()
    ITEM_STATUSES.set(output, bySection)
    const previous = bySection.get(sectionId)
    if (previous?.local !== local) {
        bySection.set(sectionId, {local, statuses: itemStatusesOf([...local, ...output], sectionId)})
    }
    return bySection.get(sectionId).statuses
}

// What a section's items say, while the reads it was said of are the same.
const ITEM_STATUSES = new WeakMap()

const NO_STATUSES = Object.freeze({})

const selectedStatusOf = (state, reads, sectionId) => {
    const own = reads.filter(({declaration}) => declaration.section.id === sectionId)
    if (!own.some(({selected}) => selected)) {
        return null
    }
    const names = recipeNamesOf(state)
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
// operation (`requestGate`): null when none holds it, otherwise {state, recipe, section, refusedBy} - the recipe's name
// and the section to review in it, or the name of the recipe further up whose own refusal holds it, to review instead.
// Why is that section's to say, in the recipe. A source not selected holds it as much as an unsuitable one.
export const heldSourceStatusOfState = (state, recipe, gate) => {
    if (!gate) {
        return null
    }
    const names = recipeNamesOf(state)
    const status = statusOf(gate.read, names)
    const refusedBy = gate.read.refusedBy
    return status && {
        state: status.state,
        recipe: names[recipe.id] || recipe.title || recipe.placeholder || recipe.id,
        recipeId: recipe.id,
        section: msg(gate.section),
        ...(refusedBy && {refusedBy: names[refusedBy] || refusedBy, refusedById: refusedBy})
    }
}

// The sections held back by an unavailable or unsuitable source, or by their own configuration, and why:
// {[sectionId]: message}, for a toolbar to mark them. An advisory marks nothing, and neither does a declaration whose
// type chooses not to mark it there (`toolbarMark: false`, sourceRequirements.js).
export const sourceProblemsOfState = (state, recipeId, evidenceOwnerOf, now = Date.now(), heldFor) =>
    sectionProblemsOfState(state, recipeId, evidenceOwnerOf, now, heldFor).sourceProblems

// The same from one read of the requirements, beside what a toolbar says of the section a wizard has open as its step
// (`wizardStepProblems`): without what a declaration waits to say until the wizard has moved on from it
// (`wizardStepMark: false`, sourceRequirements.js) - the same object where no declaration waits. `incompleteSections`
// and `wizardStepIncompleteSections` name, {[sectionId]: true}, those of them held back only by work not done yet.
export const sectionProblemsOfState = (state, recipeId, evidenceOwnerOf, now = Date.now(), heldFor) => {
    const reads = readsOf(state, recipeId, evidenceOwnerOf, now, heldFor)
    const listing = selectFrom(state, 'process.recipes')
    const previous = SOURCE_PROBLEMS.get(reads)
    if (previous && previous.listing === listing) {
        return previous.problems
    }
    const marked = reads.filter(({declaration}) => declaration.toolbarMark !== false)
    const atStep = marked.filter(({declaration}) => declaration.wizardStepMark !== false)
    const statuses = sourceProblemStatuses(state, marked)
    const atStepStatuses = atStep.length === marked.length ? statuses : sourceProblemStatuses(state, atStep)
    const sourceProblems = _.mapValues(statuses, ({message}) => message)
    const problems = {
        sourceProblems,
        wizardStepProblems: atStepStatuses === statuses ? sourceProblems : _.mapValues(atStepStatuses, ({message}) => message),
        sourceProblemContents: _.mapValues(statuses, ({messageContent}) => messageContent),
        wizardStepProblemContents: _.mapValues(atStepStatuses, ({messageContent}) => messageContent),
        incompleteSections: incompleteSectionsOf(statuses),
        wizardStepIncompleteSections: incompleteSectionsOf(atStepStatuses)
    }
    SOURCE_PROBLEMS.set(reads, {listing, problems})
    return problems
}

// What the sections say, while the reads they were said of, and the names they name, are the same.
const SOURCE_PROBLEMS = new WeakMap()

const sourceProblemStatuses = (state, reads) => {
    return Object.fromEntries(_.uniq(reads.map(({declaration}) => declaration.section.id))
        .map(section => [section, sectionStatusOf(state, reads, section)])
        .filter(([_section, status]) => [UNAVAILABLE_SOURCE, UNSUITABLE_SOURCE, UNMET_CONFIGURATION].includes(status?.state)))
}

const incompleteSectionsOf = statuses => _.mapValues(_.pickBy(statuses, ({incomplete}) => incomplete), () => true)

const readsOf = (state, recipeId, evidenceOwnerOf, now, heldFor) => {
    const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
    return recipe ? readSourceRequirements({state, recipe, evidenceOwnerOf, heldFor, now}) : []
}

const PRECEDENCE = [UNSUITABLE_SOURCE, UNAVAILABLE_SOURCE, CHECKING_SOURCE]

// What is wrong with the selection itself - nothing it selects provides the capability - is said once, by what holds the
// section back.
const operationAdvisories = (reads, blocking, names) => reads
    .map(read => [unsuitable(read, names), operationLabel(read.declaration)])
    .filter(([status]) => status)
    .filter(([status], index, all) => !sameMessage(status, blocking) && all.findIndex(([other]) => sameMessage(other, status)) === index)
    .map(([{message, messageContent}, about]) => messageContent
        ? describeFeedback(feedbackMessage('process.source.status.advisory', {about, message: messageContent}))
        : {message: msg('process.source.status.advisory', {about, message})})

const sameMessage = (a, b) => a.message === b?.message && _.isEqual(a.messageContent, b?.messageContent)

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
// A declaration with a `summary(reads)` says its items' problems in that one sentence, naming none of them.
const configurationStatusOf = (reads, sectionId) => {
    const unmet = reads.filter(read => read.local && read.declaration.section.id === sectionId && read.verdict.status === UNSUPPORTED
        && !waitsOnAnotherSection(read))
    const summarizing = _.uniq(unmet.map(({declaration}) => declaration).filter(({summary}) => summary))
    const itemized = unmet.filter(({declaration}) => !declaration.summary)
    const problems = _.sortBy([
        ...summarizing.map(declaration => {
            const summarized = unmet.filter(read => read.declaration === declaration)
            return {
                message: declaration.summary(summarized),
                ...(declaration.summaryContent && {messageContent: declaration.summaryContent(summarized)}),
                details: [],
                incomplete: summarized.every(isIncomplete)
            }
        }),
        ...[
            ...itemized.filter(read => read.ownVerdict.status === UNSUPPORTED).map(read => ({read, ...ownDiagnosis(read), incomplete: isIncomplete(read)})),
            ...itemized.filter(read => read.ownVerdict.status !== UNSUPPORTED && localPrerequisites(read).length)
                .map(read => ({read, message: prerequisitesMessage(localPrerequisites(read)), details: [], incomplete: false}))
        ]
            .map(({read, message, messageContent, details, incomplete}) => read.item
                ? {...(messageContent
                    ? describeFeedback(feedbackMessage('process.requirement.itemProblem', {item: read.item.label, message: messageContent}))
                    : {message: msg('process.requirement.itemProblem', {item: read.item.label, message})}), details, incomplete}
                : {message, messageContent, details, incomplete})
    ], ({incomplete}) => incomplete ? 1 : 0)
    return problems.length
        ? {
            state: UNMET_CONFIGURATION,
            message: problems[0].message,
            ...(problems[0].messageContent && {messageContent: problems[0].messageContent}),
            details: [...problems[0].details, ...problems.slice(1).map(({message}) => message)],
            refresh: false,
            advisories: [],
            incomplete: problems.every(({incomplete}) => incomplete)
        }
        : null
}

// What a local read says: its own diagnosis, followed by the prerequisites in its section it waits on, named - not by
// what they say. Held by nothing else, or waiting on another section, it says nothing.
export const localStatusOf = read => {
    if (read.verdict.status === SUPPORTED || waitsOnAnotherSection(read)) {
        return null
    }
    const own = read.ownVerdict.status === UNSUPPORTED ? ownDiagnosis(read) : null
    const local = localPrerequisites(read)
    const prerequisites = local.length ? prerequisitesMessage(local) : null
    if (!own && !prerequisites) {
        return null
    }
    return {
        state: UNMET_CONFIGURATION,
        message: own ? own.message : prerequisites,
        ...(own?.messageContent && {messageContent: own.messageContent}),
        details: own ? [...own.details, ...(prerequisites ? [prerequisites] : [])] : [],
        ...(own?.referenceFeedback && {referenceFeedback: own.referenceFeedback}),
        refresh: false,
        advisories: [],
        incomplete: Boolean(own) && isIncomplete(read)
    }
}

// What an item says of everything found of it, in turn: what is wrong before what is unfinished, each once, with the
// recipes it names and the repairs it gives. A single finding is said as it is.
const itemStatusOf = statuses => {
    if (statuses.length === 1) {
        return statuses[0]
    }
    const said = _.uniqBy(_.sortBy(statuses, ({incomplete}) => incomplete ? 1 : 0), status => JSON.stringify(saying(status)))
    const content = joinFeedback(said.map(saying))
    return {
        ..._.omit(said[0], 'messageContent'),
        ...typeof content === 'string' ? {message: content} : describeFeedback(content),
        details: said.flatMap(({details}) => details),
        incomplete: said.every(({incomplete}) => incomplete)
    }
}

const saying = ({message, messageContent}) => messageContent || message

const prerequisitesMessage = prerequisites =>
    msg('process.requirement.prerequisiteUnmet', {items: prerequisites.map(({label, item}) => label || item).join(', ')})

// The unmet prerequisites of a read not known to lie in another section.
const localPrerequisites = ({declaration, unmetPrerequisites}) =>
    unmetPrerequisites.filter(({section}) => !section || section === declaration.section.id)

const waitsOnAnotherSection = ({declaration, unmetPrerequisites = []}) =>
    unmetPrerequisites.some(({section}) => section && section !== declaration.section.id)

const isIncomplete = ({ownVerdict}) => Boolean(ownVerdict.diagnostic?.incomplete)

const ownDiagnosis = ({ownVerdict, declaration}) =>
    declaration.requirement.describe(ownVerdict.diagnostic)

const statusOf = (read, names) => {
    if (read.local) {
        return localStatusOf(read)
    }
    if (read.outputState) {
        return outputStateStatusOf(read)
    }
    const {selected, selects, acquisition, verdict, declaration, assetId, missing} = read
    if (verdict.status === SUPPORTED || (!selects && verdict.status !== UNSUPPORTED)) {
        return null
    }
    const status = (state, message, refresh, details = []) => ({selected, state, message, details, refresh})
    if (verdict.status === UNSUPPORTED) {
        const {message, messageContent, details} = diagnosis(verdict.diagnostic, declaration, names)
        return {...status(UNSUITABLE_SOURCE, message, false, details), ...(messageContent && {messageContent})}
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

// What holds an operation while a recipe's output read neither describes it nor refuses a selection
// (sourceRequirements.js): only gates ask, so it names no selection.
const outputStateStatusOf = ({acquisition}) => {
    const status = (state, message, refresh) => ({selected: null, state, message, details: [], refresh})
    if (acquisition === CHECKING) {
        return status(CHECKING_SOURCE, msg('process.source.status.checking'), false)
    }
    return acquisition === UNAVAILABLE
        ? status(UNAVAILABLE_SOURCE, msg('process.source.status.unavailable'), true)
        : status(UNSUITABLE_SOURCE, msg('process.retrieve.error.imageOutput'), false)
}

const diagnosis = (diagnostic, declaration, names) => {
    const {capability, describe} = declaration.requirement
    const values = {
        way: joinFeedback((diagnostic.chain || []).map(({record}) => joinFeedback([recordMessage(record, names), ' → '], '')), ''),
        source: diagnostic.at?.record ? recordMessage(diagnostic.at.record, names) : '',
        capability: msg(capability.label)
    }
    const plain = message => ({message, details: []})
    switch (diagnostic.code) {
        case NOT_A_PRODUCER:
            return {...describeFeedback(feedbackMessage('process.source.status.notAProducer', values)), details: []}
        case UNFILLED_ROLE:
            return {...describeFeedback(feedbackMessage('process.source.status.unfilledRole', values)), details: []}
        case CYCLIC_SOURCE:
            return plain(msg('process.source.status.cyclic'))
        case MISSING_SOURCE:
            return plain(msg('process.source.status.missing'))
        default:
            return describe?.(diagnostic) || {...describeFeedback(feedbackMessage('process.source.status.unsuitable', values)), details: []}
    }
}

const recordMessage = (record, names) =>
    joinFeedback([getRecipeType(record.type)?.labels?.name || record.type, ' \'', recipeReference(record.id, names[record.id] || record.id), '\''], '')
