import _ from 'lodash'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {getTaskInfo} from '~/app/home/body/process/recipe/recipeOutputPath'
import {publishEvent} from '~/eventPublisher'
import {select} from '~/store'
import {msg} from '~/translate'
import {isGoogleAccount} from '~/user'
import {Notifications} from '~/widget/notifications'

import {retrieveButtonState} from './sampling/retrieveButtonState'
import {toTaskAllocation} from './sampling/taskAllocation'

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        retrieve(retrieveOptions) {
            const capability = {
                googleAccount: isGoogleAccount(),
                assetRoots: select('assets.roots')
            }
            return actionBuilder('REQUEST_SAMPLES_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe, capability))
                .dispatch()
        },
    }
}

// Sampling Design initializes layers with skipThis, so there's no "this-recipe" image source. Older
// in-development recipes may have saved areas pointing at it; remap those to the Google Satellite
// basemap so the map/menu don't dereference a missing source. All other saved layer state (feature
// layers, split mode) is preserved. Pure and testable.
export const normalizeSavedLayers = savedLayers => {
    if (!savedLayers?.areas) {
        return savedLayers
    }
    return {
        ...savedLayers,
        areas: _.mapValues(savedLayers.areas, area => {
            if (!area) {
                return area
            }
            const normalized = {...area}
            if (area.imageLayer?.sourceId === 'this-recipe') {
                normalized.imageLayer = {...area.imageLayer, sourceId: 'google-satellite'}
            }
            return normalized
        })
    }
}

// Shape the task payload: replace the persisted allocation with the canonical, normalized allocation
// rows the backend samplers consume ({stratum, sampleSize, area, color, ...}). Pure and testable.
// A stale relativeMarginOfError (an unreleased absolute/relative toggle) is dropped so it reaches neither
// the task recipe nor the recipe_* metadata; Sampling Design margins are always relative.
export const toTaskRecipe = recipe => {
    const {relativeMarginOfError: _relativeMarginOfError, ...sampleAllocation} = recipe.model?.sampleAllocation || {}
    return {
        ...recipe,
        model: {
            ...recipe.model,
            sampleAllocation: {
                ...sampleAllocation,
                allocation: toTaskAllocation(recipe.model)
            }
        }
    }
}

const taskProperties = recipe => ({
    recipe_id: recipe.id,
    recipe_projectId: recipe.projectId,
    recipe_type: recipe.type,
    recipe_title: recipe.title || recipe.placeholder,
    ..._(recipe.model)
        .mapValues(value => JSON.stringify(value))
        .mapKeys((_value, key) => `recipe_${key}`)
        .value()
})

export const submitRetrieveRecipeTask = (recipe, capability) => {
    const {disabled, kind, code, args} = retrieveButtonState({
        model: recipe.model,
        ...capability
    })
    if (disabled) {
        Notifications.error(kind === 'capability'
            ? {
                message: msg('process.samplingDesign.retrieve.capability.title'),
                error: msg(`process.samplingDesign.retrieve.capability.${code}`),
                group: true,
                timeout: 0
            }
            : {
                message: msg('process.samplingDesign.retrieve.invalid'),
                error: msg(`process.samplingDesign.retrieve.invalid.${code}`, args),
                group: true,
                timeout: 0
            })
        return
    }
    // Submit the materialized task recipe so both the payload and the recipe_* properties reflect the
    // canonical allocation rather than the editor's persisted (possibly old-shape) allocation.
    const taskRecipe = toTaskRecipe(recipe)
    const destination = taskRecipe.ui.retrieveOptions.destination
    const operation = `samplingDesign.${destination}`
    const name = taskRecipe.title || taskRecipe.placeholder
    const title = msg([`process.retrieve.form.task.${destination}`], {name})
    // Normalized metadata the task list/details UI renders (recipe type, project, destination, output
    // path, sharing). Custom submitters must add this like the generic retrieve submitter does.
    const taskInfo = getTaskInfo({
        recipe: taskRecipe,
        destination,
        retrieveOptions: taskRecipe.ui.retrieveOptions
    })
    const task = {
        operation,
        params: {
            title,
            description: name,
            recipe: taskRecipe,
            properties: taskProperties(taskRecipe),
            taskInfo,
            ...taskRecipe.ui.retrieveOptions
        }
    }
    publishEvent('submit_task', {
        recipe_type: taskRecipe.type,
        destination
    })
    return api.tasks.submit$(task).subscribe()
}
