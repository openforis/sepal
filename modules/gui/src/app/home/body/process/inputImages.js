import _ from 'lodash'

import {recipeActionBuilder, recipePath} from '~/app/home/body/process/recipe'
import {select} from '~/store'

// The source of an input image is its type and id. Inputs are told apart by their imageId: a saved recipe can hold two
// that share a source, and each stays its own entry, edited and removed alone.
export const inputSourceKey = ({type, id}) =>
    type && id ? `${type}:${id}` : null

// The sources an input may not take: those of the recipe's other inputs. An input keeps the source it was saved with,
// even where another input shares it, so leaving it unchanged refuses nothing.
export const otherInputSources = (images, imageId) => {
    const ownKey = inputSourceKey(images.find(image => image.imageId === imageId) || {})
    return _.uniq(images
        .filter(image => image.imageId !== imageId)
        .map(inputSourceKey)
        .filter(key => key && key !== ownKey))
}

export const isTakenSource = (otherSources, type, id) =>
    (otherSources || []).includes(inputSourceKey({type, id}))

export const DUPLICATE_SOURCE = 'process.panels.inputImagery.form.duplicateSource'

// A field predicate refusing a source of the given type that another input takes, read from the form's otherSources.
export const isFreeSource = type =>
    (id, {otherSources}) => !isTakenSource(otherSources, type, id)

// The form editing an input learns the other inputs' sources as where its otherSources started: knowing them edits
// nothing.
export const adoptOtherSources = (otherSources, images, imageId) => {
    const others = otherInputSources(images || [], imageId)
    if (!_.isEqual(otherSources.value, others)) {
        otherSources.setInitialValue(others)
    }
}

// A constraint keeps its input's exact source identity when that input disappears. The imageId remains the execution
// reference; imageSource is only used to reconnect it on an applied input change. Existing references always refresh
// their source identity, including when an input's selected source changes. Ambiguous legacy inputs supply no identity
// and are never chosen as replacements.
export const reconcileConstraintInputs = (constraints, images, previousImages = images) => {
    if (!Array.isArray(constraints)) return constraints
    const byId = uniqueInputs(images, image => image?.imageId)
    const bySource = uniqueInputs(images, sourceOf)
    const previousById = uniqueInputs(previousImages, image => image?.imageId)
    const previousBySource = uniqueInputs(previousImages, sourceOf)
    return constraints.map(constraint => {
        if (!constraint || typeof constraint.image !== 'string' || !constraint.image) return constraint
        const {imageSource: retained, ...settings} = constraint
        const current = byId.get(constraint.image)
        const previous = previousById.get(constraint.image)
        const source = byId.has(constraint.image)
            ? current && bySource.get(sourceOf(current)) === current ? sourceOf(current) : null
            : previousById.has(constraint.image)
                ? previous && previousBySource.get(sourceOf(previous)) === previous ? sourceOf(previous) : null
                : typeof retained === 'string' ? retained : null
        const replacement = !byId.has(constraint.image) && bySource.get(source)
        return {
            ...settings,
            ...(source ? {imageSource: source} : {}),
            ...(replacement && byId.get(replacement.imageId) === replacement ? {image: replacement.imageId} : {})
        }
    })
}

const sourceOf = image => ['ASSET', 'RECIPE_REF'].includes(image?.type) && typeof image.id === 'string'
    ? inputSourceKey(image)
    : null

const uniqueInputs = (images, keyOf) => {
    const result = new Map()
    images.forEach(image => {
        const key = keyOf(image)
        if (typeof key === 'string' && key) result.set(key, result.has(key) ? null : image)
    })
    return result
}

const remappingInputUpdates = (recipe, images) => recipe.type === 'REMAPPING' && Array.isArray(recipe.model?.legend?.entries)
    ? [{
        path: 'model.legend.entries',
        value: recipe.model.legend.entries.map(entry => ({
            ...entry,
            constraints: reconcileConstraintInputs(entry.constraints, images, recipe.model.inputImagery?.images || [])
        }))
    }]
    : []

// Applied atomically with the input by RecipeFormPanel.additionalUpdates, never while editing or cancelling it.
export const appliedInputImageUpdates = (recipeId, image) => {
    const recipe = select(recipePath(recipeId))
    const images = recipe.model.inputImagery?.images || []
    const updated = images.some(({imageId}) => imageId === image.imageId)
        ? images.map(input => input.imageId === image.imageId ? image : input)
        : [...images, image]
    return remappingInputUpdates(recipe, updated)
}

export const removeInputImage = (recipeId, imageToRemove) => {
    const recipe = select(recipePath(recipeId))
    const images = (recipe.model.inputImagery?.images || []).filter(image => image.imageId !== imageToRemove.imageId)
    const builder = recipeActionBuilder(recipeId)('REMOVE_INPUT_IMAGE', {imageToRemove})
    remappingInputUpdates(recipe, images).forEach(({path, value}) => builder.set(path, value))
    return builder
        .del(['model.inputImagery.images', {imageId: imageToRemove.imageId}])
        .del(['ui.inputImagery.images', {imageId: imageToRemove.imageId}])
        .dispatch()
}
