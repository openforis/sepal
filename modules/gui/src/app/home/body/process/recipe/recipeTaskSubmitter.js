import _ from 'lodash'

import {
    physicalDestinationCompatibility,
    VALID_SELECTION
} from '#sepal/recipe/output/physicalDestinationCompatibility'
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
// Selected bands are matched by NAME. Order is schema, not correspondence. The resolved names are what is
// executed: "all bands", and a legacy absent selection, become every available name rather than an empty
// selection the producer would answer with its default image. Earth Engine requires policy authority for every
// selected band; the direct scalar renderers require verified scalar dimensionality and receive no resolved
// pyramiding policy.
//
// Policies are carried verbatim. A whitelist would reject a policy Earth Engine gains before SEPAL learns of
// it, and deriving one from a band name is the coupling this contract exists to remove.
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const isNonBlankPolicy = policy => typeof policy === 'string' && Boolean(policy.trim())
const fallbackPolicyForBand = (fallbackPolicies, name) => {
    if (!fallbackPolicies || typeof fallbackPolicies !== 'object' || Array.isArray(fallbackPolicies)) {
        return undefined
    }
    if (hasOwn(fallbackPolicies, name)) {
        return fallbackPolicies[name]
    }
    return hasOwn(fallbackPolicies, '.default')
        ? fallbackPolicies['.default']
        : undefined
}

const resolvedImageOutputRequirements = (
    recipe,
    destination,
    bands,
    useAllBands,
    {executionReference, output},
    fallbackPyramidingPolicy
) => {
    if (executionReference?.type !== RECIPE_REF || executionReference?.id !== recipe.id) {
        throw new Error(`Resolved image output describes execution ${JSON.stringify(executionReference)}, not the submitted recipe ${recipe.id}`)
    }
    const compatibility = physicalDestinationCompatibility({
        bands: output.bands,
        selectedBandNames: bands,
        useAllBands
    })
    if (compatibility.selectionStatus !== VALID_SELECTION) {
        if (compatibility.missingBandNames.length) {
            throw new Error(`Selected band "${compatibility.missingBandNames[0]}" is not described by the resolved image output`)
        }
        throw new Error('Resolved image output does not provide a valid selected band schema')
    }
    if (['GEE', 'DRIVE', 'SEPAL'].includes(destination) && !compatibility.destinations[destination]) {
        throw new Error(`Resolved selected band schema is not physically compatible with destination ${destination}`)
    }
    const selected = compatibility.selectedBands

    if (destination === 'GEE') {
        const policyByBand = new Map()
        const missingScalarPolicies = []

        selected.forEach(({name, dataType, pyramidingPolicy}) => {
            if (isNonBlankPolicy(pyramidingPolicy)) {
                policyByBand.set(name, pyramidingPolicy)
            } else if (fallbackPyramidingPolicy === undefined) {
                throw new Error(`Selected band "${name}" has no resolved Earth Engine pyramiding policy`)
            } else if (dataType?.arrayDimensions !== 0) {
                throw new Error(`Selected band "${name}" is not a verified scalar band eligible for fallback policy`)
            } else {
                missingScalarPolicies.push(name)
            }
        })

        if (missingScalarPolicies.length) {
            const fallbackPolicies = typeof fallbackPyramidingPolicy === 'function'
                ? fallbackPyramidingPolicy(missingScalarPolicies)
                : fallbackPyramidingPolicy

            missingScalarPolicies.forEach(name => {
                const policy = fallbackPolicyForBand(fallbackPolicies, name)
                if (!isNonBlankPolicy(policy)) {
                    throw new Error(`Fallback pyramiding policy does not provide selected scalar band "${name}"`)
                }
                policyByBand.set(name, policy)
            })
        }

        return {
            pyramidingPolicy: Object.fromEntries(selected.map(({name}) => [name, policyByBand.get(name)])),
            selectedBandNames: selected.map(({name}) => name)
        }
    }

    return {
        pyramidingPolicy: undefined,
        selectedBandNames: selected.map(({name}) => name)
    }
}

export const submitRetrieveRecipeTask = (recipe, {
    retrieveOptions = recipe.ui.retrieveOptions,
    ...config
} = {}) => {
    const {
        dataSetType,
        pyramidingPolicy,
        imageOutputDescription,
        fallbackPyramidingPolicy,
        includeTimeRange = true,
        filterVisualizations = false,
        customizeImage
    } = config

    // Two authorities for one decision, which is the defect this contract removes. Refused rather than
    // resolved by precedence, so a half-finished migration cannot silently keep exporting the old policy.
    if (imageOutputDescription && pyramidingPolicy) {
        throw new Error(`Recipe ${recipe.id} configures both a resolved image output and a legacy pyramiding policy; only one may decide export requirements`)
    }
    if (hasOwn(config, 'fallbackPyramidingPolicy') && !imageOutputDescription) {
        throw new Error(`Recipe ${recipe.id} configures fallback pyramiding policy without a resolved image output description`)
    }

    const name = recipe.title || recipe.placeholder
    const destination = retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = retrieveOptions.bands
    const operation = `image.${destination}`
    const resolvedRequirements = imageOutputDescription
        ? resolvedImageOutputRequirements(
            recipe,
            destination,
            bands,
            retrieveOptions.useAllBands,
            imageOutputDescription,
            fallbackPyramidingPolicy
        )
        : undefined
    const effectiveRetrieveOptions = imageOutputDescription
        ? {...retrieveOptions, bands: resolvedRequirements.selectedBandNames}
        : retrieveOptions
    const effectiveBands = effectiveRetrieveOptions.bands

    let visualizations = getAllVisualizations(recipe)
    if (filterVisualizations) {
        visualizations = visualizations.filter(({bands: visBands}) =>
            visBands.every(band => effectiveBands.includes(band))
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
        retrieveOptions: effectiveRetrieveOptions
    })
    
    // Build base image object
    let image = {
        recipe: _.omit(recipe, ['ui']),
        ...effectiveRetrieveOptions,
        bands: {selection: effectiveBands},
        visualizations,
        properties: recipeProperties
    }
    
    // Add pyramiding policy if specified
    if (imageOutputDescription) {
        if (resolvedRequirements.pyramidingPolicy) {
            image.pyramidingPolicy = resolvedRequirements.pyramidingPolicy
        }
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
