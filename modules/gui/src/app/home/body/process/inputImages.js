import _ from 'lodash'

import {CALCULATION_REFERENCES, calculationItem} from '#sepal/recipe/bandMath/calculationReferences'
import {SUPPORTED} from '#sepal/recipe/requirement/verdict'
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

// Band Math already retains usedBands when an input disappears. Keep the same imageSource convention there; the
// existing imageName and band id are needed to recover expressions and their calculated output identities too.
const captureCalculationSources = (calculations, images, previousImages) => calculations.map((calculation, index) => {
    if (!Array.isArray(calculation?.usedBands) && calculation?.type !== 'EXPRESSION') return calculation
    let usedBands = Array.isArray(calculation.usedBands) ? calculation.usedBands : []
    // Whole-image expressions may have gained bands since their editor last saved usedBands. Refresh from the same
    // analysis as readiness, before changing inputs. Keep broken snapshots, including references whose name another
    // input now occupies: resolving that expression by name must not silently retarget its retained source identity.
    if (calculation.type === 'EXPRESSION') {
        const item = calculationItem({images: previousImages, calculations}, index)
        if (CALCULATION_REFERENCES.evaluate(item.facts).status === SUPPORTED
            && usedBands.every(band => item.facts.scope.some(image => image.imageId === band?.imageId))) {
            usedBands = item.facts.analysis.usedBands.map(band => ({
                ...usedBands.find(previous => previous.imageId === band.imageId && previous.name === band.name), ...band
            }))
        }
    }
    const sources = reconcileConstraintInputs(usedBands.map(band => band && ({
        image: band.imageId, imageSource: band.imageSource
    })), images, previousImages)
    return {...calculation, usedBands: usedBands.map((band, index) => {
        if (!band || typeof band.imageId !== 'string') return band
        const {imageSource: _source, ...reference} = band
        return {...reference, ...(sources[index]?.imageSource ? {imageSource: sources[index].imageSource} : {})}
    })}
})

const calculationBands = calculations => calculations.flatMap(calculation =>
    Array.isArray(calculation?.usedBands) ? calculation.usedBands.filter(band => band && typeof band.imageId === 'string') : [])

// Only one former input/name may claim a source. A name occupied by another input or calculation, or retained for
// another missing source, is never reclaimed. This is also the new-input form's suggestion, not a saved repair.
export const restoredInputName = (image, images, calculations) => {
    const source = sourceOf(image)
    if (!source || images.some(other => other.imageId !== image.imageId && sourceOf(other) === source)) return null
    const missing = calculationBands(calculations).filter(band =>
        ![...images, ...calculations].some(other => other.imageId === band.imageId))
    const references = missing.filter(band => band.imageSource === source)
    const identities = _.uniqBy(references, band => JSON.stringify([band.imageId, band.imageName]))
    if (identities.length !== 1) return null
    const {imageName: name, imageId} = identities[0]
    return typeof name === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,29}$/.test(name)
        && ![...images.filter(other => other.imageId !== image.imageId), ...calculations].some(other => other.name === name)
        && !missing.some(band => band.imageName === name && (band.imageSource !== source || band.imageId !== imageId))
        ? name : null
}

const bandMathInputUpdates = (recipe, images) => {
    if (recipe.type !== 'BAND_MATH') return []
    const previousImages = recipe.model.inputImagery?.images || []
    const calculations = captureCalculationSources(recipe.model.calculations?.calculations || [], images, previousImages)
    const byId = uniqueInputs(images, image => image?.imageId)
    const bySource = uniqueInputs(images, sourceOf)
    const reconnected = calculations.map(calculation => !Array.isArray(calculation?.usedBands) ? calculation : {
        ...calculation,
        usedBands: calculation.usedBands.map(band => {
            if (!band || byId.has(band.imageId) || calculations.some(other => other.imageId === band.imageId)) return band
            const replacement = bySource.get(band.imageSource)
            return replacement && byId.get(replacement.imageId) === replacement
                && replacement.name === band.imageName && restoredInputName(replacement, images, calculations) === band.imageName
                ? {...band, imageId: replacement.imageId} : band
        })
    })
    const references = calculationBands(reconnected)
    // A returning selected band keeps the id still used by preserved calculations. Otherwise normal Sync would
    // replace expression output bands and discard their custom names. No deleted output selection is recreated.
    const restored = images.map(image => ({...image, includedBands: (image.includedBands || []).map(band => {
        const previous = previousImages.find(previous => previous.imageId === image.imageId)
        if (previous?.includedBands?.some(old => old.name === band.name)) return band
        const ids = _.uniq(references.filter(reference => reference.imageId === image.imageId
            && reference.imageSource === sourceOf(image) && reference.name === band.name).map(({id}) => id))
        return ids.length === 1 && typeof ids[0] === 'string' ? {...band, id: ids[0]} : band
    })}))
    return [
        {path: 'model.inputImagery.images', value: restored},
        {path: 'model.calculations.calculations', value: reconnected}
    ]
}

const inputUpdates = (recipe, images) => [...remappingInputUpdates(recipe, images), ...bandMathInputUpdates(recipe, images)]

// Applied atomically with the input by RecipeFormPanel.additionalUpdates, never while editing or cancelling it.
export const appliedInputImageUpdates = (recipeId, image) => {
    const recipe = select(recipePath(recipeId))
    const images = recipe.model.inputImagery?.images || []
    const updated = images.some(({imageId}) => imageId === image.imageId)
        ? images.map(input => input.imageId === image.imageId ? image : input)
        : [...images, image]
    return inputUpdates(recipe, updated)
}

export const removeInputImage = (recipeId, imageToRemove) => {
    const recipe = select(recipePath(recipeId))
    const images = (recipe.model.inputImagery?.images || []).filter(image => image.imageId !== imageToRemove.imageId)
    const builder = recipeActionBuilder(recipeId)('REMOVE_INPUT_IMAGE', {imageToRemove})
    inputUpdates(recipe, images).forEach(({path, value}) => builder.set(path, value))
    return builder
        .del(['model.inputImagery.images', {imageId: imageToRemove.imageId}])
        .del(['ui.inputImagery.images', {imageId: imageToRemove.imageId}])
        .dispatch()
}
