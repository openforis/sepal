// Create-side packet builder. Mirrors prepareHandlePacket$ (update) but its
// source-of-truth is spec.defaultModel() — no GUI load-recipe round-trip —
// and it always pulls user-required handles (handles with userRequired=true
// in the catalog) into the writable set, regardless of what the picker chose.
// That keeps user-required-but-missing values visible to the updater so it
// can ask one clarification question instead of inventing them.

import {of} from 'rxjs'

import {getRecipeHandles, getRecipeSpec, toEffectiveModel} from '#recipes'

import {buildHandlePacket} from '../handlePacket.js'
import {publishPrepareHandlePacketCompleted} from '../recipeFlowEvents.js'

function prepareCreatePacket$({recipeType, pickedHandles, bus, conversationId}) {
    const spec = getRecipeSpec(recipeType)
    if (!spec) return of({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipeType} has no spec`}})
    const requiredHandles = userRequiredHandleNames(recipeType)
    const effectiveModel = toEffectiveModel(recipeType, spec.defaultModel())
    const result = buildHandlePacket({recipeType, effectiveModel, pickedHandles, requiredHandles})
    if (result.ok) publishOnSuccess({bus, conversationId, recipeType, packet: result.data})
    return of(result)
}

function userRequiredHandleNames(recipeType) {
    return (getRecipeHandles(recipeType) || [])
        .filter(handle => handle.userRequired === true)
        .map(handle => handle.name)
}

function publishOnSuccess({bus, conversationId, recipeType, packet}) {
    if (!bus) return
    publishPrepareHandlePacketCompleted({
        bus, conversationId, recipeType, flow: 'create',
        pickedHandles: packet.pickedHandles,
        requiredHandles: packet.requiredHandles,
        writableHandles: packet.writableHandles,
        readOnlyHandles: packet.readOnlyHandles
    })
}

export {prepareCreatePacket$}
