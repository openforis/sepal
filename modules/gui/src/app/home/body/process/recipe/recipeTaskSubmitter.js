import _ from 'lodash'

import {RECIPE_REF} from '#sepal/recipe/source/reference'
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

// Export requirements taken from a resolved IMAGE_OUTPUT description instead of a recipe-type policy.
//
// The description is evidence about ONE execution, so it is accepted only for the recipe being submitted:
// resolving a Masking over CCDC yields CCDC's bands, but under the Masking's own execution reference, and a
// description still carrying the inner reference describes a different export. Identity is the type and id
// together, because an asset and a recipe can share a string.
//
// Selected bands are matched by NAME. Order is schema, not correspondence: pairing by position would give
// each band whichever policy sat at the same index. An empty or absent selection means all bands - what
// `useAllBands` submits - so every described band gets its policy rather than none of them.
//
// Policies are carried verbatim. A whitelist would reject a policy Earth Engine gains before SEPAL learns of
// it, and deriving one from a band name is the coupling this contract exists to remove.
const toPyramidingPolicy = (recipe, bands, {executionReference, output}) => {
    if (executionReference?.type !== RECIPE_REF || executionReference?.id !== recipe.id) {
        throw new Error(`Resolved image output describes execution ${JSON.stringify(executionReference)}, not the submitted recipe ${recipe.id}`)
    }
    const policyByBand = new Map(output.bands.map(({name, pyramidingPolicy}) => [name, pyramidingPolicy]))
    const selection = bands?.length ? bands : output.bands.map(({name}) => name)
    return Object.fromEntries(
        selection.map(name => {
            if (!policyByBand.has(name)) {
                throw new Error(`Selected band "${name}" is not described by the resolved image output`)
            }
            return [name, policyByBand.get(name)]
        })
    )
}

export const submitRetrieveRecipeTask = (recipe, config = {}) => {
    const {
        dataSetType,
        pyramidingPolicy,
        imageOutputDescription,
        includeTimeRange = true,
        filterVisualizations = false,
        customizeImage
    } = config

    // Two authorities for one decision, which is the defect this contract removes. Refused rather than
    // resolved by precedence, so a half-finished migration cannot silently keep exporting the old policy.
    if (imageOutputDescription && pyramidingPolicy) {
        throw new Error(`Recipe ${recipe.id} configures both a resolved image output and a legacy pyramiding policy; only one may decide export requirements`)
    }

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
        const recipeType = getRecipeType(recipe.type)
        // Date range is optional metadata. Keep the type lookup strict when time metadata is requested;
        // decorator inheritance belongs to output resolution.
        const [timeStart, timeEnd] = (recipeType.getDateRange?.(recipe) || [])
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
    if (imageOutputDescription) {
        image.pyramidingPolicy = toPyramidingPolicy(recipe, bands, imageOutputDescription)
    } else if (pyramidingPolicy) {
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
