import _ from 'lodash'

import {
    physicalDestinationCompatibility,
    VALID_SELECTION
} from '#sepal/recipe/output/physicalDestinationCompatibility'
import {isCanonicalDescription} from '#sepal/recipe/output/product'
import {RECIPE_REF} from '#sepal/recipe/source/reference'
import api from '~/apiRegistry'
import {getTaskInfo} from '~/app/home/body/process/recipe/recipeOutputPath'
import {recipeVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {publishEvent} from '~/eventPublisher'
import {msg} from '~/translate'

export const pyramidingPolicies = {

    //  For change detection recipes - specified band uses 'mode', others use 'mean'
    changeBased: bandName => bands => {
        const policy = {}
        bands.forEach(band => policy[band] = band === bandName ? 'mode' : 'mean')
        return policy
    },

    //  Earth Engine's own default, stated. Only ever a fallback: subordinate to a declared policy and applied to
    //  verified scalar bands alone - it says nothing about whether averaging suits a band.
    mean: {'.default': 'mean'}
}

// Export requirements taken from physical facts instead of a recipe-type policy: a resolved IMAGE_OUTPUT
// description, or - for a declared wrapper over a source that declares nothing - what its evidence lifecycle
// currently vouches for about that source.
//
// A description is evidence about ONE execution, so it is accepted only for the recipe being submitted:
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

const describedRequirements = (recipe, description, selection) => {
    const {executionReference, output} = description
    if (executionReference?.type !== RECIPE_REF || executionReference?.id !== recipe.id) {
        throw new Error(`Resolved image output describes execution ${JSON.stringify(executionReference)}, not the submitted recipe ${recipe.id}`)
    }
    if (!isCanonicalDescription(description)) {
        throw new Error(`Resolved image output describes the map product ${output.product.name} of recipe ${recipe.id}, not its image output`)
    }
    return physicalRequirements(output.bands, selection)
}

const physicalRequirements = (physicalBands, selection) => {
    const {destination} = selection
    const requirements = exportRequirements(physicalBands, selection)
    const {compatibility} = requirements
    if (compatibility.selectionStatus !== VALID_SELECTION) {
        if (compatibility.missingBandNames.length) {
            throw new Error(`Selected band "${compatibility.missingBandNames[0]}" is not described by the resolved image output`)
        }
        throw new Error('Resolved image output does not provide a valid selected band schema')
    }
    if (['GEE', 'DRIVE', 'SEPAL'].includes(destination) && !compatibility.destinations[destination]) {
        throw new Error(`Resolved selected band schema is not physically compatible with destination ${destination}`)
    }
    if (destination === 'GEE' && requirements.policyError) {
        throw new Error(requirements.policyError)
    }
    return {
        pyramidingPolicy: destination === 'GEE' ? requirements.pyramidingPolicy : undefined,
        selectedBandNames: requirements.selectedBandNames
    }
}

// What exporting these bands requires: the destinations their physical schema allows, and the Earth Engine policy
// for each - its declared one, or the fallback for a verified scalar. Earth Engine is allowed only where every band
// has one. The one definition, whether a panel is deciding what to offer or a submission what to send. Policies are
// derived only where they are consumed: for Earth Engine, or with no destination named, to decide whether it is
// allowed.
export const exportRequirements = (physicalBands, {bands, useAllBands, fallbackPyramidingPolicy, destination}) => {
    const compatibility = physicalDestinationCompatibility({bands: physicalBands, selectedBandNames: bands, useAllBands})
    if (compatibility.selectionStatus !== VALID_SELECTION) {
        return {compatibility, destinations: null}
    }
    const selected = compatibility.selectedBands
    const {pyramidingPolicy, policyError} = destination === undefined || destination === 'GEE'
        ? earthEnginePolicies(selected, fallbackPyramidingPolicy)
        : {}
    return {
        compatibility,
        destinations: {...compatibility.destinations, GEE: compatibility.destinations.GEE && !policyError},
        pyramidingPolicy,
        policyError,
        selectedBandNames: selected.map(({name}) => name)
    }
}

const earthEnginePolicies = (selected, fallbackPyramidingPolicy) => {
    const policyByBand = new Map()
    const missingScalarPolicies = []
    for (const {name, dataType, pyramidingPolicy} of selected) {
        if (isNonBlankPolicy(pyramidingPolicy)) {
            policyByBand.set(name, pyramidingPolicy)
        } else if (fallbackPyramidingPolicy === undefined) {
            return {policyError: `Selected band "${name}" has no resolved Earth Engine pyramiding policy`}
        } else if (dataType?.arrayDimensions !== 0) {
            return {policyError: `Selected band "${name}" is not a verified scalar band eligible for fallback policy`}
        } else {
            missingScalarPolicies.push(name)
        }
    }
    if (missingScalarPolicies.length) {
        const fallbackPolicies = typeof fallbackPyramidingPolicy === 'function'
            ? fallbackPyramidingPolicy(missingScalarPolicies)
            : fallbackPyramidingPolicy
        for (const name of missingScalarPolicies) {
            const policy = fallbackPolicyForBand(fallbackPolicies, name)
            if (!isNonBlankPolicy(policy)) {
                return {policyError: `Fallback pyramiding policy does not provide selected scalar band "${name}"`}
            }
            policyByBand.set(name, policy)
        }
    }
    return {pyramidingPolicy: Object.fromEntries(selected.map(({name}) => [name, policyByBand.get(name)]))}
}

// The Retrieve options are explicit: the ones validated are the ones submitted, whatever the recipe last stored.
// `visualizationBands` is the caller's answer about the output, which the styles attached to the export are drawn
// from; only those naming bands the export carries are attached.
export const submitRetrieveRecipeTask = (recipe, {retrieveOptions, ...config}) => {
    const {
        dataSetType,
        imageOutputDescription,
        observedBands,
        fallbackPyramidingPolicy,
        includeTimeRange = true,
        visualizationBands
    } = config

    // Two authorities for one decision. Refused rather than resolved by precedence, so neither can silently
    // decide what the other describes.
    if (imageOutputDescription && observedBands) {
        throw new Error(`Recipe ${recipe.id} configures both a resolved image output and observed source bands; only one may decide export requirements`)
    }
    if (hasOwn(config, 'fallbackPyramidingPolicy') && !imageOutputDescription && !observedBands) {
        throw new Error(`Recipe ${recipe.id} configures fallback pyramiding policy without physical facts to apply it to`)
    }

    const name = recipe.title || recipe.placeholder
    const destination = retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const bands = retrieveOptions.bands
    const operation = `image.${destination}`
    const selection = {destination, bands, useAllBands: retrieveOptions.useAllBands, fallbackPyramidingPolicy}
    const resolvedRequirements = imageOutputDescription
        ? describedRequirements(recipe, imageOutputDescription, selection)
        : observedBands
            ? physicalRequirements(observedBands, selection)
            : undefined
    const effectiveRetrieveOptions = resolvedRequirements
        ? {...retrieveOptions, bands: resolvedRequirements.selectedBandNames}
        : retrieveOptions
    const effectiveBands = effectiveRetrieveOptions.bands || []

    const visualizations = recipeVisualizations(recipe, visualizationBands)
        .filter(({bands: visBands}) => visBands.every(band => effectiveBands.includes(band)))
    
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
    
    // Only physical facts decide a policy. Without them none is sent, and Earth Engine's own default applies.
    if (resolvedRequirements?.pyramidingPolicy) {
        image.pyramidingPolicy = resolvedRequirements.pyramidingPolicy
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
