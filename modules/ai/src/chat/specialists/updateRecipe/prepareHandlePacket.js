const {catchError, of} = require('rxjs')
const {map, tap} = require('rxjs/operators')
const {getRecipeHandles, getRecipeLlmMetadata, getRecipeSpec, toEffectiveModel} = require('#recipes')
const {fieldShapeAt} = require('../../tools/fieldShapeFromSchema')
const {guiProductRequest$} = require('../../tools/guiProductRequest')
const {parsePointer, resolvePointer, PointerNotFound} = require('../../tools/jsonPointer')
const {publishPrepareHandlePacketCompleted} = require('../specialistEvents')

// Prepares one handle-keyed packet per update attempt. Two sources expand the
// writable set:
//   - schema/rule dependency metadata (already in llmMetadata.constraints)
//   - handle-declared `couplings` (conditional, recipe-agnostic)
// Coupling expansion runs to a fixed point so couplings on newly-added
// dependents can fire in turn. Coupling metadata never applies changes
// automatically — it just expands writable scope and emits handle-keyed
// facts/examples for the updater.
function prepareHandlePacket$({guiRequests, bus, recipeId, recipeType, pickedHandles, context}) {
    const handles = getRecipeHandles(recipeType)
    if (!handles) return of({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipeType} has no handle catalog`}})
    const handlesByName = new Map(handles.map(handle => [handle.name, handle]))
    const unknown = pickedHandles.filter(name => !handlesByName.has(name))
    if (unknown.length) {
        return of({ok: false, error: {code: 'UNKNOWN_HANDLE', message: `Unknown handle(s) for ${recipeType}: ${unknown.join(', ')}`, handles: unknown}})
    }
    return guiProductRequest$(guiRequests, context, 'load-recipe', {recipeId}).pipe(
        map(recipe => buildPacket({recipe, recipeType, pickedHandles, handles, handlesByName})),
        tap(packet => publishOnSuccess({bus, conversationId: context?.conversationId, recipeType, packet})),
        catchError(error => of({ok: false, error: {code: error.code || 'TOOL_FAILED', message: error.message}}))
    )
}

function publishOnSuccess({bus, conversationId, recipeType, packet}) {
    if (!bus || !packet?.ok) return
    publishPrepareHandlePacketCompleted({
        bus, conversationId, recipeType,
        pickedHandles: packet.data.pickedHandles,
        dependentHandles: packet.data.dependentHandles,
        writableHandles: packet.data.writableHandles
    })
}

function buildPacket({recipe, recipeType, pickedHandles, handles, handlesByName}) {
    if (!recipe?.modelHash) {
        return {ok: false, error: {code: 'MISSING_MODEL_HASH', message: 'GUI load-recipe response is missing modelHash'}}
    }
    const schema = getRecipeSpec(recipeType)?.schema
    const handlesByPath = new Map(handles.map(handle => [handle.path, handle]))
    const constraints = getRecipeLlmMetadata(recipeType)?.constraints || []
    const effectiveModel = toEffectiveModel(recipeType, recipe.model)

    const focusPaths = pickedHandles.map(name => handlesByName.get(name).path)
    const relevantConstraints = constraintsTouching(constraints, focusPaths)
    const schemaDependents = dependentHandlesFrom(relevantConstraints, focusPaths, handlesByPath, pickedHandles)
    const {couplingDependents, couplingFacts} = expandCouplings({
        seed: [...pickedHandles, ...schemaDependents],
        handles, handlesByName, effectiveModel
    })
    // Selector handles (rich allowedItems with companionHandles) eagerly pull
    // every item's companions into writable so the updater can swap items as
    // well as add to or strip from the current selection.
    const selectorDependents = expandSelectorItemCompanions({
        seed: distinct([...pickedHandles, ...schemaDependents, ...couplingDependents]),
        handlesByName
    })
    const dependentHandles = distinct([...schemaDependents, ...couplingDependents, ...selectorDependents])
    const writableHandles = distinct([...pickedHandles, ...dependentHandles])

    const fields = Object.fromEntries(writableHandles.map(name => [
        name, fieldEntry(handlesByName.get(name), effectiveModel, schema)
    ]))
    return {
        ok: true,
        data: {
            baseModelHash: recipe.modelHash,
            pickedHandles,
            dependentHandles,
            writableHandles,
            fields,
            dependencyFacts: dependencyFacts(relevantConstraints, dependentHandles, handlesByPath, handlesByName),
            couplingFacts,
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

function constraintsTouching(constraints, focusPaths) {
    return constraints.filter(constraint =>
        constraint.paths.some(path => focusPaths.some(focus => pointerRelates(focus, path)))
    )
}

function dependentHandlesFrom(constraints, focusPaths, handlesByPath, pickedHandles) {
    const pickedSet = new Set(pickedHandles)
    const dependents = []
    const seen = new Set()
    for (const constraint of constraints) {
        for (const path of constraint.paths) {
            if (focusPaths.some(focus => pointerRelates(focus, path))) continue
            const handle = handleForPath(path, handlesByPath)
            if (!handle) continue
            if (pickedSet.has(handle.name)) continue
            if (seen.has(handle.name)) continue
            seen.add(handle.name)
            dependents.push(handle.name)
        }
    }
    return dependents
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

module.exports = {prepareHandlePacket$}
