import {map, of, switchMap} from 'rxjs'

import api from '~/apiRegistry'
import {registerGuiAction as registerAction} from '~/app/home/body/chat/guiActionRegistry'
import {getLogger} from '~/log'
import {select} from '~/store'

import {initializeRecipe} from '../recipe'
import {getRecipeType} from '../recipeTypeRegistry'
import {respondError} from './response'

const log = getLogger('chat-image-actions')

const ALLOWED_ASSET_TYPES = ['Image', 'ImageCollection']

const loadRecipe$ = recipeId => {
    const cached = select(['process.loadedRecipes', recipeId])
    return cached ? of(cached) : api.recipe.load$(recipeId).pipe(map(initializeRecipe))
}

const recipeBands$ = id =>
    loadRecipe$(id).pipe(
        switchMap(recipe => api.gee.bands$({recipe}).pipe(
            map(bands => ({bands}))
        ))
    )

const assetBandsAndType$ = id =>
    api.gee.assetMetadata$({asset: id, allowedTypes: ALLOWED_ASSET_TYPES}).pipe(
        map(metadata => ({
            bands: (metadata.bands || []).map(({id}) => id),
            assetType: metadata.type
        }))
    )

const imageBands = ({type, id, respond}) => {
    if (!id) {
        respond({success: false, error: 'id is required'})
        return
    }
    const stream$ = type === 'RECIPE_REF' ? recipeBands$(id)
        : type === 'ASSET' ? assetBandsAndType$(id)
            : null
    if (!stream$) {
        respond({success: false, error: `Unknown type '${type}'. Expected 'RECIPE_REF' or 'ASSET'.`})
        return
    }
    stream$.subscribe({
        next: data => respond({success: true, data}),
        error: error => respondError({log, respond, fallback: 'Failed to load image bands', error})
    })
}

const containsBand = (viz, band) => Array.isArray(viz.bands) && viz.bands.includes(band)

const projectForBand = (visualizations, band) => {
    if (!band) return {visualizations}
    const filtered = visualizations.filter(v => containsBand(v, band))
    const continuous = filtered.find(v => v.type === 'continuous')
    const categorical = filtered.find(v => v.type === 'categorical')
    const result = {visualizations: filtered}
    if (continuous) {
        const i = continuous.bands.indexOf(band)
        if (Array.isArray(continuous.min) && continuous.min[i] !== undefined) result.bandMin = continuous.min[i]
        if (Array.isArray(continuous.max) && continuous.max[i] !== undefined) result.bandMax = continuous.max[i]
    }
    if (categorical) {
        if (Array.isArray(categorical.values)) result.values = categorical.values
        if (Array.isArray(categorical.labels)) result.labels = categorical.labels
        if (Array.isArray(categorical.palette)) result.palette = categorical.palette
    }
    return result
}

const recipeVisualizations$ = (id, band) =>
    loadRecipe$(id).pipe(
        map(recipe => {
            const recipeType = getRecipeType(recipe.type)
            const all = recipeType && recipeType.getPreSetVisualizations
                ? recipeType.getPreSetVisualizations(recipe) || []
                : []
            return projectForBand(all, band)
        })
    )

const assetVisualizations$ = (id, band) =>
    api.gee.assetMetadata$({asset: id, allowedTypes: ALLOWED_ASSET_TYPES}).pipe(
        map(metadata => projectForBand(metadata.visualizations || [], band))
    )

const imageVisualizations = ({type, id, band, respond}) => {
    if (!id) {
        respond({success: false, error: 'id is required'})
        return
    }
    const stream$ = type === 'RECIPE_REF' ? recipeVisualizations$(id, band)
        : type === 'ASSET' ? assetVisualizations$(id, band)
            : null
    if (!stream$) {
        respond({success: false, error: `Unknown type '${type}'. Expected 'RECIPE_REF' or 'ASSET'.`})
        return
    }
    stream$.subscribe({
        next: data => respond({success: true, data}),
        error: error => respondError({log, respond, fallback: 'Failed to load image visualizations', error})
    })
}

const assetMetadata = ({id, respond}) => {
    if (!id) {
        respond({success: false, error: 'id is required'})
        return
    }
    api.gee.assetMetadata$({asset: id, allowedTypes: ALLOWED_ASSET_TYPES}).subscribe({
        next: metadata => respond({success: true, data: metadata}),
        error: error => respondError({log, respond, fallback: 'Failed to load asset metadata', error})
    })
}

export const registerImageActions = () => {
    registerAction('image-bands', imageBands)
    registerAction('image-visualizations', imageVisualizations)
    registerAction('asset-metadata', assetMetadata)
}
