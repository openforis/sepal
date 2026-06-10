// Shared handle-keyed packet builder — the structured input a recipe
// specialist receives. Computes two disjoint handle sets:
//
//   writableHandles: handles the updater may set. Seeded from
//     pickedHandles + handle-declared `couplings` + selector-item
//     companionHandles + caller-supplied requiredHandles, then grown by
//     validation-rule SUBJECTS (the "violated path" the rule asserts about)
//     when any of the rule's other paths is already writable.
//   readOnlyHandles: validation-rule trigger/context paths that aren't
//     writable. The updater may inspect these (label / currentValue / etc.)
//     but never set them. Read-only paths do NOT further expand writability
//     — picking cloudMethods makes corrections read-only context, but does
//     not then promote brdfMultiplier through corrections.
//
// `fields` carries writable entries; `readOnlyFields` carries read-only
// entries. The two together describe everything the rule graph reaches from
// the picker's selection. JSON Pointer paths stay below this boundary; only
// handle names cross it.

import {getRecipeHandles, getRecipeLlmMetadata, getRecipeSpec} from '#sepal/recipes'

import {fieldShapeAt} from '../tools/fieldShapeFromSchema.js'
import {parsePointer, PointerNotFound, resolvePointer} from '../tools/jsonPointer.js'
import {applicabilityConflictFor, isSelectorHandle, scopeIndexFromHandles, scopeValueIn} from './applicability.js'

function buildHandlePacket({recipeType, effectiveModel, pickedHandles, requiredHandles = []}) {
    const handles = getRecipeHandles(recipeType)
    if (!handles) return {ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipeType} has no handle catalog`}}
    const handlesByName = new Map(handles.map(handle => [handle.name, handle]))
    const unknownPicked = pickedHandles.filter(name => !handlesByName.has(name))
    if (unknownPicked.length) {
        return {ok: false, error: {code: 'UNKNOWN_HANDLE', message: `Unknown handle(s) for ${recipeType}: ${unknownPicked.join(', ')}`, handles: unknownPicked}}
    }
    const unknownRequired = requiredHandles.filter(name => !handlesByName.has(name))
    if (unknownRequired.length) {
        return {ok: false, error: {code: 'UNKNOWN_HANDLE', message: `Unknown required handle(s) for ${recipeType}: ${unknownRequired.join(', ')}`, handles: unknownRequired}}
    }

    const schema = getRecipeSpec(recipeType)?.schema
    const handlesByPath = new Map(handles.map(handle => [handle.path, handle]))
    const constraints = getRecipeLlmMetadata(recipeType)?.constraints || []

    // Step 1: explicit-intent expansions are writable. Picked + required form
    // the writable seed; couplings (handle-author intent) and selector-item
    // companions (you can't swap items without their companions) expand from
    // that same seed — so a future required handle that declares couplings or
    // is a selector still gets its companions pulled in.
    const explicitSeed = distinct([...pickedHandles, ...requiredHandles])
    const {couplingDependents, couplingFacts} = expandCouplings({
        seed: explicitSeed,
        handles, handlesByName, effectiveModel
    })
    const selectorDependents = expandSelectorItemCompanions({
        seed: distinct([...explicitSeed, ...couplingDependents]),
        handlesByName
    })
    const initialWritable = distinct([
        ...explicitSeed,
        ...couplingDependents,
        ...selectorDependents
    ])

    // Step 2: rule expansion splits subjects (writable) from context (readOnly).
    const {writableHandles, readOnlyHandles, relevantConstraints} = expandConstraints({
        constraints, seedHandles: initialWritable, handlesByName, handlesByPath
    })

    const fields = Object.fromEntries(writableHandles.map(name => [
        name, fieldEntry(handlesByName.get(name), effectiveModel, schema)
    ]))
    const readOnlyFields = Object.fromEntries(readOnlyHandles.map(name => [
        name, fieldEntry(handlesByName.get(name), effectiveModel, schema)
    ]))
    return {
        ok: true,
        data: {
            pickedHandles,
            requiredHandles,
            writableHandles,
            readOnlyHandles,
            fields,
            readOnlyFields,
            dependencyFacts: dependencyFacts(relevantConstraints, readOnlyHandles, handlesByPath, handlesByName),
            couplingFacts,
            applicabilityFacts: applicabilityFactsFor({writableHandles, handlesByName, effectiveModel}),
            inactiveCompanionFacts: inactiveCompanionFactsFor({writableHandles, handlesByName, effectiveModel}),
            validationRules: validationRulesFor(relevantConstraints, handlesByPath)
        }
    }
}

function fieldEntry(handle, effectiveModel, schema) {
    const {exists, value} = pathState(effectiveModel, handle.path)
    const required = schema ? fieldShapeAt(schema, handle.path).required : false
    return {
        label: handle.label,
        description: handle.description,
        currentValue: exists ? value : null,
        present: exists,
        required,
        ...(handle.userRequired === true ? {userRequired: true} : {}),
        ...optional('valueGuidance', handle.valueGuidance),
        ...optional('summaryGuidance', handle.summaryGuidance),
        ...optional('performanceNote', handle.performanceNote),
        ...optional('allowedValues', handle.allowedValues),
        ...optional('allowedItems', handle.allowedItems),
        ...optional('allowedKeys', handle.allowedKeys),
        ...optional('valueLabels', handle.valueLabels),
        ...optional('examples', handle.examples),
        ...optional('range', handle.range),
        ...optional('format', handle.format)
    }
}

function optional(key, value) {
    return value === undefined ? {} : {[key]: value}
}

// Walk all declared couplings to a fixed point. A coupling fires when its
// trigger handle is in the writable set AND its `when` condition holds for
// the current effective model. Firing adds its `expands` handles to writable;
// new entries can in turn trigger more couplings on later iterations.
function expandCouplings({seed, handles, handlesByName, effectiveModel}) {
    const writable = new Set(seed)
    const facts = []
    const fired = new Set()
    const allCouplings = handles.flatMap(handle => handle.couplings || [])
    let added = true
    while (added) {
        added = false
        for (const coupling of allCouplings) {
            const key = couplingKey(coupling)
            if (fired.has(key)) continue
            if (!writable.has(coupling.when.handle)) continue
            if (!conditionHolds(coupling.when, effectiveModel, handlesByName)) continue
            fired.add(key)
            facts.push(renderCoupling(coupling, handlesByName))
            for (const handle of coupling.expands || []) {
                if (!writable.has(handle)) {
                    writable.add(handle)
                    added = true
                }
            }
        }
    }
    return {
        couplingDependents: [...writable].filter(handle => !seed.includes(handle)),
        couplingFacts: facts
    }
}

function couplingKey(coupling) {
    return JSON.stringify([coupling.when, coupling.expands || []])
}

function expandSelectorItemCompanions({seed, handlesByName}) {
    const expansions = []
    for (const handleName of seed) {
        const handle = handlesByName.get(handleName)
        if (!Array.isArray(handle?.allowedItems)) continue
        for (const item of handle.allowedItems) {
            if (!item || typeof item !== 'object') continue
            for (const companion of item.companionHandles || []) {
                if (!seed.includes(companion)) expansions.push(companion)
            }
        }
    }
    return distinct(expansions)
}

// For each writable selector handle, emit one fact per item whose appliesTo
// requirement is not currently satisfied by the scope handle that holds its
// vocabulary. The scope-handle resolution + conflict detection live in
// ./applicability; per-fact guidance is templated from data so the policy
// the model reads stays out of keyword-matching code.
function applicabilityFactsFor({writableHandles, handlesByName, effectiveModel}) {
    const scopeIndex = scopeIndexFromHandles(handlesByName)
    const scopeValueOf = handle => scopeValueIn(effectiveModel, handle)
    const facts = []
    for (const handleName of writableHandles) {
        const handle = handlesByName.get(handleName)
        if (!isSelectorHandle(handle)) continue
        for (const item of handle.allowedItems) {
            const conflict = applicabilityConflictFor(item, scopeIndex, scopeValueOf)
            if (conflict) facts.push(renderApplicabilityFact(handle, item, conflict))
        }
    }
    return facts
}

// For each writable companion handle, surface a fact when its selector item
// isn't currently active in the effective model AND no other selector item it
// companions for is active either. Drives two kinds of updater behaviour:
//   - selector is writable → guidance says "to set this companion, also include
//     <item> in <selector> in the same atomic call" (the same-call activation
//     contract — the runtime guard enforces it via toEffectiveModel projection).
//   - selector is read-only → guidance says "do not set this companion; the
//     selector that would activate it is not writable here."
// A companion never activates its own selector item — it only configures one
// that is (or is being) activated by setting the selector itself.
function inactiveCompanionFactsFor({writableHandles, handlesByName, effectiveModel}) {
    const writable = new Set(writableHandles)
    const refsByCompanion = buildCompanionReverseIndex(handlesByName)
    const facts = []
    for (const handleName of writableHandles) {
        const refs = refsByCompanion.get(handleName) || []
        if (!refs.length) continue
        const anyActive = refs.some(ref => isSelectorItemActive(effectiveModel, ref))
        if (anyActive) continue
        for (const ref of refs) {
            facts.push(renderInactiveCompanionFact({
                companionHandle: handlesByName.get(handleName),
                ref,
                selectorWritable: writable.has(ref.selectorHandleName)
            }))
        }
    }
    return facts
}

function buildCompanionReverseIndex(handlesByName) {
    const index = new Map()
    for (const selectorHandle of handlesByName.values()) {
        if (!isSelectorHandle(selectorHandle)) continue
        for (const item of selectorHandle.allowedItems) {
            if (!item || typeof item !== 'object') continue
            for (const companion of item.companionHandles || []) {
                const list = index.get(companion) || []
                list.push({
                    selectorHandleName: selectorHandle.name,
                    selectorHandlePath: selectorHandle.path,
                    selectorLabel: selectorHandle.label,
                    itemValue: item.value,
                    itemLabel: item.label
                })
                index.set(companion, list)
            }
        }
    }
    return index
}

function isSelectorItemActive(effectiveModel, ref) {
    const {exists, value} = pathState(effectiveModel, ref.selectorHandlePath)
    if (!exists) return false
    if (Array.isArray(value)) return value.includes(ref.itemValue)
    if (value && typeof value === 'object') return Object.prototype.hasOwnProperty.call(value, ref.itemValue)
    return value === ref.itemValue
}

function renderInactiveCompanionFact({companionHandle, ref, selectorWritable}) {
    const companionLabel = companionHandle.label || companionHandle.name
    const baseExplain = `${companionLabel} only configures ${ref.itemLabel} when ${ref.selectorLabel} includes it; setting this value alone does NOT activate ${ref.itemLabel}.`
    const action = selectorWritable
        ? `If you want to set ${companionLabel}, set ${ref.selectorHandleName} in the same atomic call to include ${ref.itemLabel}.`
        : `Do not set ${companionLabel} here — ${ref.selectorHandleName} is read-only in this scope, so ${ref.itemLabel} cannot be activated.`
    return {
        handle: companionHandle.name,
        label: companionLabel,
        selectorHandle: ref.selectorHandleName,
        selectorLabel: ref.selectorLabel,
        item: ref.itemValue,
        itemLabel: ref.itemLabel,
        selectorWritable,
        guidance: `${baseExplain} ${action}`
    }
}

function renderApplicabilityFact(selectorHandle, item, conflict) {
    const required = formatList(conflict.missingKeys.map(key => labelForScopeKey(key, conflict.scopeHandle)))
    return {
        selectorHandle: selectorHandle.name,
        item: item.value,
        itemLabel: item.label,
        requires: {handle: conflict.scopeHandle.name, anyOfKeys: conflict.missingKeys},
        currentValue: conflict.currentValue,
        guidance: `${item.label} requires ${required} in ${conflict.scopeHandle.label.toLowerCase()}. Do not silently change ${conflict.scopeHandle.name} unless the user asked to change it.`
    }
}

function labelForScopeKey(key, scopeHandle) {
    return scopeHandle.valueLabels?.[key] || key
}

function formatList(items) {
    if (items.length <= 1) return items.join('')
    if (items.length === 2) return `${items[0]} or ${items[1]}`
    return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`
}

function conditionHolds(when, effectiveModel, handlesByName) {
    const triggerHandle = handlesByName.get(when.handle)
    if (!triggerHandle) return false
    const {exists, value} = pathState(effectiveModel, triggerHandle.path)
    if (when.includes !== undefined) return exists && Array.isArray(value) && value.includes(when.includes)
    if (when.excludes !== undefined) return !exists || !Array.isArray(value) || !value.includes(when.excludes)
    if (when.equals !== undefined) return exists && value === when.equals
    if (when.missingKey !== undefined) return !exists || !isObject(value) || !Object.prototype.hasOwnProperty.call(value, when.missingKey)
    if (when.hasKey !== undefined) return exists && isObject(value) && Object.prototype.hasOwnProperty.call(value, when.hasKey)
    if (when.present !== undefined) return when.present ? exists : !exists
    return false
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function renderCoupling(coupling, handlesByName) {
    const involvedHandles = distinct([coupling.when.handle, ...(coupling.expands || [])])
    return {
        involvedHandles,
        triggerHandle: coupling.when.handle,
        triggerLabel: handlesByName.get(coupling.when.handle)?.label,
        condition: describeCondition(coupling.when),
        expands: coupling.expands || [],
        ...optional('guidance', coupling.guidance),
        ...optional('examples', coupling.examples)
    }
}

function describeCondition({includes, excludes, equals, missingKey, hasKey, present}) {
    if (includes !== undefined) return {kind: 'includes', value: includes}
    if (excludes !== undefined) return {kind: 'excludes', value: excludes}
    if (equals !== undefined) return {kind: 'equals', value: equals}
    if (missingKey !== undefined) return {kind: 'missingKey', value: missingKey}
    if (hasKey !== undefined) return {kind: 'hasKey', value: hasKey}
    if (present !== undefined) return {kind: present ? 'present' : 'absent'}
    return {kind: 'unknown'}
}

// Walk validation-rule constraints to a fixed point, splitting subjects from
// trigger/context paths:
//   - A constraint is "active" when any of its paths is in the writable set
//     (writable triggers the rule).
//   - Each active constraint's subject paths (the "violated" / required-companion
//     paths the rule asserts about) become writable. Non-subject paths whose
//     handles aren't already writable become read-only context.
//   - Read-only handles never expand further — focus only includes writable
//     paths, so a rule whose only writable touchpoint is a read-only handle
//     doesn't fire. This is what stops cloudMethods → corrections (read-only)
//     → brdfMultiplier from cascading into writable.
// A constraint with no subjectPaths declared (legacy) only emits read-only
// context — no auto-promotion, the safer default.
function expandConstraints({constraints, seedHandles, handlesByName, handlesByPath}) {
    const writable = new Set(seedHandles)
    const readOnly = new Set()
    const relevant = []
    const seenConstraints = new Set()
    let added = true
    while (added) {
        added = false
        const focusPaths = [...writable].map(name => handlesByName.get(name)?.path).filter(Boolean)
        for (const constraint of constraints) {
            if (!constraint.paths.some(path => focusPaths.some(focus => pointerRelates(focus, path)))) continue
            if (!seenConstraints.has(constraint.name)) {
                seenConstraints.add(constraint.name)
                relevant.push(constraint)
            }
            const subjectPaths = new Set(constraint.subjectPaths || [])
            for (const path of constraint.paths) {
                const handle = handleForPath(path, handlesByPath)
                if (!handle) continue
                if (writable.has(handle.name)) continue
                if (subjectPaths.has(path)) {
                    writable.add(handle.name)
                    readOnly.delete(handle.name)
                    added = true
                } else {
                    readOnly.add(handle.name)
                }
            }
        }
    }
    return {
        writableHandles: [...writable],
        readOnlyHandles: [...readOnly].filter(name => !writable.has(name)),
        relevantConstraints: relevant
    }
}

function dependencyFacts(constraints, dependentHandles, handlesByPath, handlesByName) {
    const dependents = new Set(dependentHandles)
    const facts = []
    for (const constraint of constraints) {
        for (const path of constraint.paths) {
            const handle = handleForPath(path, handlesByPath)
            if (!handle || !dependents.has(handle.name)) continue
            facts.push({
                handle: handle.name,
                label: handlesByName.get(handle.name)?.label,
                constraint: constraint.name,
                description: constraint.description
            })
        }
    }
    return facts
}

function validationRulesFor(constraints, handlesByPath) {
    return constraints.map(({name, description, paths}) => ({
        name,
        description,
        handles: distinct(paths.map(path => handleForPath(path, handlesByPath)?.name).filter(Boolean))
    }))
}

// A constraint path may name a parent-of-handle (e.g. /sources/dataSets is
// also a handle, and /sources/dataSets/SENTINEL_2 is below it); match the
// closest handle, including ancestor handles, so child-path constraints still
// pull their parent-keyed handle in.
function handleForPath(path, handlesByPath) {
    if (handlesByPath.has(path)) return handlesByPath.get(path)
    let cursor = path
    while (true) {
        const cut = cursor.lastIndexOf('/')
        if (cut <= 0) return null
        cursor = cursor.slice(0, cut)
        if (handlesByPath.has(cursor)) return handlesByPath.get(cursor)
    }
}

function pointerRelates(a, b) {
    return a === b || a.startsWith(b + '/') || b.startsWith(a + '/')
}

function distinct(list) {
    return [...new Set(list)]
}

function pathState(model, path) {
    try {
        return {exists: true, value: resolvePointer(model, parsePointer(path))}
    } catch (error) {
        if (error instanceof PointerNotFound) return {exists: false, value: undefined}
        throw error
    }
}

export {buildHandlePacket}
