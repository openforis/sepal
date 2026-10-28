import _ from 'lodash'

import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'

import {recipeActionBuilder, recipePath} from '../recipe'
import {getRecipeType} from '../recipeTypeRegistry'
import {isEditableLayerSource} from './layerSourceEdit'

// The layout's image sources for the images a recipe reads, derived from what it declares it reads (its shared
// definition's `directSources`, and the `displaySources` an editor shows but execution does not), kept to the roles its
// GUI type lists as `dependencyLayerRoles`. Derived, they follow every applied input change, and opening or cancelling an
// editor writes nothing. A derived source is identified by the asset or recipe it shows - the id input editors gave the
// sources they once saved - so a map area showing it, and its styles, keep finding it.
//
// Saved sources are kept apart. Those the layout's own Add forms made, under an id of their own, are left as they are.
// Those under the id of what they show are dependency sources saved earlier, or pinned: a derived source a map area is
// given is saved, in the same write, so the area keeps it once the recipe no longer reads it, saved and reopened alike.
// Such an entry the recipe still reads gives way to its derived source. One it no longer reads is kept as a legacy
// source while an area shows it, and is otherwise hidden, then dropped by the next layout write. A type listing no
// roles derives nothing and keeps its saved sources as they are.

// {dependencySources, additionalImageLayerSources, legacySourceIds}: the derived sources, the saved ones still shown,
// and the saved ones kept only because an area shows them.
export const assembleImageLayerSources = (recipe, recipeListing = []) => {
    const saved = selectFrom(recipe, 'layers.additionalImageLayerSources') || []
    const dependencySources = dependencyLayerSources(recipe, recipeListing, saved)
    if (!dependencySources) {
        return {dependencySources: [], additionalImageLayerSources: saved, legacySourceIds: []}
    }
    const derivedIds = dependencySources.map(({id}) => id)
    const shown = shownSourceIds(selectFrom(recipe, 'layers.areas'))
    const legacy = saved.filter(source => isDependencyShaped(source) && !derivedIds.includes(source.id) && shown.includes(source.id))
    return {
        dependencySources,
        additionalImageLayerSources: saved.filter(source => !isDependencyShaped(source) || legacy.includes(source)),
        legacySourceIds: legacy.map(({id}) => id)
    }
}

// The saved sources to write with the areas a layout write leaves: each derived source an area shows that is not saved
// yet is pinned, from the list as assembled before the write, and each dependency source no area shows any longer is
// dropped. Sources the layout added are kept. A type listing no roles keeps its saved sources as they are.
export const layoutImageLayerSources = ({recipe, areas, recipeListing = []}) => {
    const saved = selectFrom(recipe, 'layers.additionalImageLayerSources') || []
    const dependencySources = dependencyLayerSources(recipe, recipeListing, saved)
    if (!dependencySources) {
        return saved
    }
    const shown = shownSourceIds(areas)
    const savedIds = saved.map(({id}) => id)
    const pinned = dependencySources.filter(({id}) => shown.includes(id) && !savedIds.includes(id))
    return [
        ...saved.filter(source => !isDependencyShaped(source) || shown.includes(source.id)),
        ...pinned
    ]
}

// The same, for the recipe and its listing as the session holds them: what every layout write setting areas writes with
// them, in the same action.
export const imageLayerSourcesForAreas = ({recipeId, areas}) =>
    layoutImageLayerSources({recipe: select(recipePath(recipeId)), areas, recipeListing: select('process.recipes') || []})

// Areas written as the layout assigns, swaps or removes them, with the saved sources they leave.
export const setLayerAreas = ({recipeId, areas, actionType = 'UPDATE_LAYER_AREAS'}) =>
    recipeActionBuilder(recipeId)(actionType)
        .set('layers.areas', areas)
        .set('layers.additionalImageLayerSources', imageLayerSourcesForAreas({recipeId, areas}))
        .dispatch()

// The recipe's derived sources, one per image read, or null for a type listing no roles. A recipe's description is its
// listing title, else the one its saved entry kept, else its id, as a recipe no longer listed is still named.
export const dependencyLayerSources = (recipe, recipeListing = [], saved = []) => {
    const roles = recipe && getRecipeType(recipe.type)?.dependencyLayerRoles
    const definition = roles && recipeType(recipe.type)
    if (!definition) {
        return null
    }
    const model = recipe.model || {}
    const edges = [...definition.directSources(model), ...(definition.displaySources?.(model) || [])]
        .map(({edge}) => edge)
        .filter(edge => edge && roles.includes(edge.role))
    return _.uniqBy(edges.map(edge => toSource(edge, recipe, recipeListing, saved)), 'id')
}

const toSource = ({reference: {type, id}, path}, recipe, recipeListing, saved) => {
    if (type === 'ASSET') {
        const visualizations = _.get(recipe, path)?.visualizations
        return {id, type: 'Asset', sourceConfig: {asset: id, description: id, ...(visualizations ? {visualizations} : {})}}
    }
    const description = recipeListing.find(listed => listed.id === id)?.name
        || saved.find(source => source.id === id)?.sourceConfig?.description
        || id
    return {id, type: 'Recipe', sourceConfig: {recipeId: id, description}}
}

// Saved under the id of the asset or recipe it shows, as dependency sources are; the layout's own have ids of their own.
const isDependencyShaped = source => !!source?.id && !isEditableLayerSource(source)
    && ['Recipe', 'Asset'].includes(source.type)

const shownSourceIds = areas => Object.values(areas || {}).map(({imageLayer}) => imageLayer?.sourceId).filter(Boolean)
