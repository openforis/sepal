// Shared by prepareHandlePacket (facts before-the-fact) and
// updateRecipeValuesTool (in-process rejection before any patch). A "scope
// handle" is one whose `allowedKeys` declares a vocabulary (e.g. datasets
// declares LANDSAT + SENTINEL_2). A selector item's `appliesTo` listing those
// keys must overlap the scope handle's value — otherwise the item is
// inapplicable. The conflict check takes a `scopeValueOf(handle)` callback so
// prepare reads the current model and update overlays the values being set
// in the same call (a write that fixes both handles together is fine).

const {parsePointer, resolvePointer, PointerNotFound} = require('../../tools/jsonPointer')

function scopeIndexFromHandles(handlesByName) {
    const index = new Map()
    for (const handle of handlesByName.values()) {
        if (!handle.allowedKeys) continue
        for (const key of Object.keys(handle.allowedKeys)) {
            if (!index.has(key)) index.set(key, handle)
        }
    }
    return index
}

function isSelectorHandle(handle) {
    return Array.isArray(handle?.allowedItems)
        && handle.allowedItems.some(item => item && typeof item === 'object' && item.value)
}

function applicabilityConflictFor(item, scopeIndex, scopeValueOf) {
    if (!Array.isArray(item?.appliesTo) || !item.appliesTo.length) return null
    const groups = new Map()
    for (const key of item.appliesTo) {
        const scopeHandle = scopeIndex.get(key)
        if (!scopeHandle) return null
        const group = groups.get(scopeHandle.name) || {scopeHandle, requiredKeys: []}
        group.requiredKeys.push(key)
        groups.set(scopeHandle.name, group)
    }
    for (const {scopeHandle, requiredKeys} of groups.values()) {
        const value = scopeValueOf(scopeHandle)
        const presentKeys = isKeyedObject(value) ? new Set(Object.keys(value)) : new Set()
        if (requiredKeys.every(key => !presentKeys.has(key))) {
            return {scopeHandle, missingKeys: requiredKeys, currentValue: value ?? null}
        }
    }
    return null
}

function scopeValueIn(model, scopeHandle) {
    try {
        return resolvePointer(model, parsePointer(scopeHandle.path))
    } catch (error) {
        if (error instanceof PointerNotFound) return undefined
        throw error
    }
}

function isKeyedObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

module.exports = {scopeIndexFromHandles, isSelectorHandle, applicabilityConflictFor, scopeValueIn}
