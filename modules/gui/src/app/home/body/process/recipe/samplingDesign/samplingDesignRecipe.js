import _ from 'lodash'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {getTaskInfo} from '~/app/home/body/process/recipe/recipeOutputPath'
import {publishEvent} from '~/eventPublisher'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

import {toTaskAllocation} from './sampling/taskAllocation'
import {validateRetrieve} from './sampling/validateRetrieve'

export const defaultModel = {
    stratification: {
        scale: 30,
        type: 'ASSET'
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_SAMPLES_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

// Shape the task payload: replace the persisted allocation with the canonical, normalized allocation
// rows the backend samplers consume ({stratum, sampleSize, area, color, ...}). Pure and testable.
export const toTaskRecipe = recipe => ({
    ...recipe,
    model: {
        ...recipe.model,
        sampleAllocation: {
            ...recipe.model?.sampleAllocation,
            allocation: toTaskAllocation(recipe.model)
        }
    }
})

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

const submitRetrieveRecipeTask = recipe => {
    // Preflight the persisted design and block submission with a clear notification if it's incomplete
    // or inconsistent (e.g. missing area, invalid sample size, proportion-dependent strategy without
    // proportions). retrieveState is write-only, so simply not submitting leaves the UI usable.
    const errors = validateRetrieve(recipe.model)
    if (errors.length) {
        const [{code}] = errors
        Notifications.error({
            message: msg('process.samplingDesign.retrieve.invalid'),
            error: msg(`process.samplingDesign.retrieve.invalid.${code}`),
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

