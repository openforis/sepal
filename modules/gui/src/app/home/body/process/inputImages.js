import _ from 'lodash'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'

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

export const removeInputImage = (recipeId, imageToRemove) =>
    recipeActionBuilder(recipeId)('REMOVE_INPUT_IMAGE', {imageToRemove})
        .del(['model.inputImagery.images', {imageId: imageToRemove.imageId}])
        .del(['ui.inputImagery.images', {imageId: imageToRemove.imageId}])
        .dispatch()
