import _ from 'lodash'

import api from '~/apiRegistry'
import {getTaskInfo} from '~/app/home/body/process/recipe/recipeOutputPath'
import {getAllVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {publishEvent} from '~/eventPublisher'
import {msg} from '~/translate'

export const pyramidingPolicies = {
    
    //  For classification recipe - 'class' band uses 'mode', others use 'mean'
    classBased: bands => {
        const policy = {}
        bands.forEach(band => policy[band] = band === 'class' ? 'mode' : 'mean')
        return policy
    },

    //  For change detection recipes - specified band uses 'mode', others use 'mean'
    changeBased: bandName => bands => {
        const policy = {}
        bands.forEach(band => policy[band] = band === bandName ? 'mode' : 'mean')
        return policy
    },

    //  For alert recipes - use sample for all bands
    sample: {'.default': 'sample'}
}

export const submitRetrieveRecipeTask = (recipe, config = {}) => {
    const {
        dataSetType,
        pyramidingPolicy,
        includeTimeRange = true,
        filterVisualizations = false,
        customizeImage
    } = config

    const name = recipe.title || recipe.placeholder
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = recipe.ui.retrieveOptions.bands
    const operation = `image.${destination}`

    let visualizations = getAllVisualizations(recipe)
    if (filterVisualizations) {
        visualizations = visualizations.filter(({bands: visBands}) =>
            visBands.every(band => bands.includes(band))
        )
    }
    
    // Build recipe properties
    const recipeProperties = {
        recipe_id: recipe.id,
        recipe_projectId: recipe.projectId,
        recipe_type: recipe.type,
        recipe_title: recipe.title || recipe.placeholder,
        ..._(recipe.model)
            .mapValues(value => JSON.stringify(value))
            .mapKeys((_value, key) => `recipe_${key}`)
            .value()
    }
    
    // Add time range if needed
    if (includeTimeRange) {
        const [timeStart, timeEnd] = (getRecipeType(recipe.type).getDateRange(recipe) || [])
            .map(date => date.valueOf())
        if (timeStart !== undefined && timeEnd !== undefined) {
            recipeProperties['system:time_start'] = timeStart
            recipeProperties['system:time_end'] = timeEnd
        }
    }
    
    const taskInfo = getTaskInfo({
        recipe,
        destination,
        retrieveOptions: recipe.ui.retrieveOptions
    })
    
    // Build base image object
    let image = {
        recipe: _.omit(recipe, ['ui']),
        ...recipe.ui.retrieveOptions,
        bands: {selection: bands},
        visualizations,
        properties: recipeProperties
    }
    
    // Add pyramiding policy if specified
    if (pyramidingPolicy) {
        if (typeof pyramidingPolicy === 'function') {
            image.pyramidingPolicy = pyramidingPolicy(bands)
        } else {
            image.pyramidingPolicy = pyramidingPolicy
        }
    }
    
    // Allow custom modifications to the image object
    if (customizeImage) {
        image = customizeImage(image, taskInfo, recipe)
    }
    
    if (destination === 'DRIVE') {
        image = {...image, driveFolder: taskInfo.outputPath}
    }
    
    // Build task
    const task = {
        operation,
        params: {
            title: taskTitle,
            description: name,
            image,
            taskInfo
        }
    }
    
    // Publish analytics event
    publishEvent('submit_task', {
        recipe_type: recipe.type,
        destination,
        ...(dataSetType && {data_set_type: dataSetType})
    })
    
    return api.tasks.submit$(task).subscribe()
}
