// Programmatic, handle-keyed prepare step. Receives picked handles (not user
// prose), loads the recipe via the GUI bridge, computes the effective model,
// maps handles to internal paths, expands deterministic validation-dependency
// companions, and builds an updater-facing packet keyed by handle. The packet
// never exposes JSON Pointer paths in the model-facing content; the mapping
// stays internal.

const {catchError, of} = require('rxjs')
const {map} = require('rxjs/operators')
const {getRecipeHandles, getRecipeLlmMetadata, toEffectiveModel} = require('#recipes')
const {guiProductRequest$} = require('../../tools/guiProductRequest')
const {parsePointer, resolvePointer, PointerNotFound} = require('../../tools/jsonPointer')

function prepareHandlePacket$({guiRequests, recipeId, recipeType, pickedHandles, context}) {
    const handles = getRecipeHandles(recipeType)
    if (!handles) return of({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipeType} has no handle catalog`}})
    const handlesByName = new Map(handles.map(handle => [handle.name, handle]))
    const unknown = pickedHandles.filter(name => !handlesByName.has(name))
    if (unknown.length) {
        return of({ok: false, error: {code: 'UNKNOWN_HANDLE', message: `Unknown handle(s) for ${recipeType}: ${unknown.join(', ')}`, handles: unknown}})
    }
    return guiProductRequest$(guiRequests, context, 'load-recipe', {recipeId}).pipe(
        map(recipe => buildPacket({recipe, recipeType, pickedHandles, handles, handlesByName})),
        catchError(error => of({ok: false, error: {code: error.code || 'TOOL_FAILED', message: error.message}}))
    )
}

function buildPacket({recipe, recipeType, pickedHandles, handles, handlesByName}) {
    if (!recipe?.modelHash) {
        return {ok: false, error: {code: 'MISSING_MODEL_HASH', message: 'GUI load-recipe response is missing modelHash'}}
    }
    const handlesByPath = new Map(handles.map(handle => [handle.path, handle]))
    const constraints = getRecipeLlmMetadata(recipeType)?.constraints || []
    const focusPaths = pickedHandles.map(name => handlesByName.get(name).path)
    const relevantConstraints = constraintsTouching(constraints, focusPaths)
    const dependentHandles = dependentHandlesFrom(relevantConstraints, focusPaths, handlesByPath, pickedHandles)
    const writableHandles = distinct([...pickedHandles, ...dependentHandles])
    const effectiveModel = toEffectiveModel(recipeType, recipe.model)
    const fields = Object.fromEntries(writableHandles.map(name => [name, fieldEntry(handlesByName.get(name), effectiveModel)]))
    return {
        ok: true,
        data: {
            baseModelHash: recipe.modelHash,
            pickedHandles,
            dependentHandles,
            writableHandles,
            fields,
            dependencyFacts: dependencyFacts(relevantConstraints, dependentHandles, handlesByPath),
            validationRules: relevantConstraints.map(({name, description}) => ({name, description}))
        }
    }
}

function fieldEntry(handle, effectiveModel) {
    const {exists, value} = pathState(effectiveModel, handle.path)
    return {
        currentValue: exists ? value : null,
        present: exists,
        description: handle.description,
        valueGuidance: handle.valueGuidance,
        ...(handle.allowedValues !== undefined ? {allowedValues: handle.allowedValues} : {}),
        ...(handle.allowedItems !== undefined ? {allowedItems: handle.allowedItems} : {}),
        ...(handle.allowedKeys !== undefined ? {allowedKeys: handle.allowedKeys} : {}),
        ...(handle.range !== undefined ? {range: handle.range} : {}),
        ...(handle.format !== undefined ? {format: handle.format} : {})
    }
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

function dependencyFacts(constraints, dependentHandles, handlesByPath) {
    const dependents = new Set(dependentHandles)
    const facts = []
    for (const constraint of constraints) {
        for (const path of constraint.paths) {
            const handle = handleForPath(path, handlesByPath)
            if (!handle || !dependents.has(handle.name)) continue
            facts.push({handle: handle.name, constraint: constraint.name, description: constraint.description})
        }
    }
    return facts
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
