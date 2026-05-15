import {forkJoin, map, of} from 'rxjs'

import api from '~/apiRegistry'
import {registerGuiAction as registerAction} from '~/app/home/body/chat/guiActionRegistry'
import {resolveSourceLabel} from '~/app/home/body/chat/sourceLabel'
import {toVisualizations} from '~/app/home/map/imageLayerSource/assetVisualizationParser'
import {mapCommand$} from '~/app/home/map/mapCommands'
import {getLogger} from '~/log'
import {select} from '~/store'
import {uuid} from '~/uuid'

import {recipeActionBuilder} from '../recipe'
import {respondError} from './response'

const log = getLogger('chat-map-actions')

const ALLOWED_ASSET_TYPES = ['Image', 'ImageCollection']

const VALID_LAYOUTS = [
    {name: 'single', keys: ['center']},
    {name: 'left-right', keys: ['left', 'right']},
    {name: 'top-bottom', keys: ['top', 'bottom']},
    {name: 'top+bottom-split', keys: ['top', 'bottom-left', 'bottom-right']},
    {name: 'bottom+top-split', keys: ['bottom', 'top-left', 'top-right']},
    {name: 'left+right-split', keys: ['left', 'top-right', 'bottom-right']},
    {name: 'right+left-split', keys: ['right', 'top-left', 'bottom-left']},
    {name: 'quadrants', keys: ['top-left', 'top-right', 'bottom-left', 'bottom-right']}
]

const layoutNameOf = areaKeys => {
    const sorted = [...areaKeys].sort().join(',')
    const match = VALID_LAYOUTS.find(l => [...l.keys].sort().join(',') === sorted)
    return match?.name || null
}

const validLayoutsDescription =
    VALID_LAYOUTS.map(l => `${l.name} {${l.keys.join(', ')}}`).join(' / ')

const blankArea = () => ({id: uuid(), imageLayer: {}, featureLayers: []})

const setView = ({recipeId, areas, respond}) => {
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: `Recipe ${recipeId} is not open`})
        return
    }
    if (!areas || typeof areas !== 'object' || !Object.keys(areas).length) {
        respond({success: false, error: 'areas must be a non-empty object'})
        return
    }
    const areaKeys = Object.keys(areas)
    const layoutName = layoutNameOf(areaKeys)
    if (!layoutName) {
        respond({success: false, error: `Invalid area key set ${JSON.stringify(areaKeys)}. Must be exactly one of: ${validLayoutsDescription}.`})
        return
    }

    forkJoin(areaKeys.map(area =>
        resolveSource$(recipe, areas[area]).pipe(map(result => ({area, ...result})))
    )).subscribe({
        next: resolutions => {
            const errors = resolutions.filter(r => r.error)
            if (errors.length) {
                respond({success: false, error: errors.map(r => `${r.area}: ${r.error}`).join('; ')})
                return
            }
            const currentAreas = recipe.layers?.areas || {}
            const nextAreas = {}
            for (const r of resolutions) {
                const existing = currentAreas[r.area] || blankArea()
                nextAreas[r.area] = {
                    ...existing,
                    imageLayer: {
                        ...(existing.imageLayer || {}),
                        sourceId: r.sourceId
                    }
                }
            }
            const existingSources = recipe.layers?.additionalImageLayerSources || []
            const sourcesById = new Map(existingSources.map(s => [s.id, s]))
            for (const r of resolutions) {
                if (r.register && !sourcesById.has(r.register.id)) {
                    sourcesById.set(r.register.id, r.register)
                }
            }
            try {
                recipeActionBuilder(recipeId)('CHAT_SET_VIEW', {layout: layoutName, areas: areaKeys})
                    .set('layers.areas', nextAreas)
                    .set('layers.additionalImageLayerSources', [...sourcesById.values()])
                    .dispatch()
                const responseAreas = resolutions.map(r => ({
                    area: r.area,
                    ...summarizeSource(recipe, r.sourceId, r.register)
                }))
                respond({success: true, data: {recipeId, layout: layoutName, areas: responseAreas}})
            } catch (error) {
                respondError({log, respond, fallback: 'Failed to set view', error})
            }
        },
        error: error => respondError({log, respond, fallback: 'Failed to set view', error})
    })
}

const resolveSource$ = (recipe, source) => {
    const additional = recipe.layers?.additionalImageLayerSources || []
    switch (source?.type) {
        case 'CURRENT':
            return of({sourceId: 'this-recipe'})
        case 'GOOGLE_SATELLITE':
            return of({sourceId: 'google-satellite'})
        case 'RECIPE_REF': {
            if (!source.id) return of({error: 'RECIPE_REF requires id'})
            const existing = additional.find(s =>
                s.type === 'Recipe' && s.sourceConfig?.recipeId === source.id
            )
            return of(existing
                ? {sourceId: existing.id}
                : {
                    sourceId: source.id,
                    register: {
                        id: source.id,
                        type: 'Recipe',
                        sourceConfig: {recipeId: source.id}
                    }
                })
        }
        case 'ASSET': {
            if (!source.id) return of({error: 'ASSET requires id'})
            const existing = additional.find(s =>
                s.type === 'Asset' && s.sourceConfig?.asset === source.id
            )
            if (existing) return of({sourceId: existing.id})
            return api.gee.assetMetadata$({asset: source.id, allowedTypes: ALLOWED_ASSET_TYPES}).pipe(
                map(metadata => ({
                    sourceId: source.id,
                    register: {
                        id: source.id,
                        type: 'Asset',
                        sourceConfig: {
                            description: source.id,
                            asset: source.id,
                            metadata,
                            visualizations: metadata.bands
                                ? toVisualizations(metadata.properties, metadata.bands)
                                    .map(viz => ({...viz, id: uuid()}))
                                : undefined
                        }
                    }
                }))
            )
        }
        default:
            return of({error: `Unknown source type: '${source?.type}'. Expected: CURRENT, RECIPE_REF, ASSET, GOOGLE_SATELLITE.`})
    }
}

// Summary that goes back to the LLM in the tool response. For Asset sources we
// surface bands + curated presets up front so the LLM doesn't have to guess
// (or hallucinate) band names when constructing a visualization.
const summarizeSource = (recipe, sourceId, registered) => {
    if (sourceId === 'this-recipe') return {sourceId, sourceType: 'Recipe', isHost: true}
    if (sourceId === 'google-satellite') return {sourceId, sourceType: 'GoogleSatellite'}
    const source = registered
        || (recipe.layers?.additionalImageLayerSources || []).find(s => s.id === sourceId)
    if (!source) return {sourceId, sourceType: 'Unknown'}
    if (source.type === 'Asset') {
        return {
            sourceId,
            sourceType: 'Asset',
            asset: source.sourceConfig?.asset,
            bands: (source.sourceConfig?.metadata?.bands || [])
                .map(b => b?.id).filter(Boolean),
            presetVisualizations: (source.sourceConfig?.visualizations || [])
                .map(viz => ({type: viz.type, bands: viz.bands, label: viz.label}))
        }
    }
    if (source.type === 'Recipe') {
        return {sourceId, sourceType: 'Recipe', recipeId: source.sourceConfig?.recipeId}
    }
    return {sourceId, sourceType: source.type}
}

const setImageLayer = ({recipeId, area, source, respond}) => {
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: `Recipe ${recipeId} is not open`})
        return
    }
    const areas = recipe.layers?.areas || {}
    if (!areas[area]) {
        const available = Object.keys(areas).join(', ') || '(none)'
        respond({success: false, error: `Unknown area "${area}". Available: ${available}. Use map_set_view to change layout (provide sources for all areas).`})
        return
    }
    resolveSource$(recipe, source).subscribe({
        next: ({sourceId, register, error}) => {
            if (error) {
                respond({success: false, error})
                return
            }
            const builder = recipeActionBuilder(recipeId)('CHAT_SET_IMAGE_LAYER', {area, sourceId})
            if (register) {
                builder.set(['layers.additionalImageLayerSources', {id: register.id}], register)
            }
            builder
                .set(['layers.areas', area, 'imageLayer', 'sourceId'], sourceId)
                .dispatch()
            respond({success: true, data: {recipeId, area, ...summarizeSource(recipe, sourceId, register)}})
        },
        error: error => respondError({log, respond, fallback: 'Failed to set image layer', error})
    })
}

const TOGGLEABLE_FEATURE_LAYERS = ['aoi', 'labels']

const setFeatureLayers = ({recipeId, area, enabled, respond}) => {
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: `Recipe ${recipeId} is not open`})
        return
    }
    const areas = recipe.layers?.areas || {}
    if (!areas[area]) {
        const available = Object.keys(areas).join(', ') || '(none)'
        respond({success: false, error: `Unknown area "${area}". Available: ${available}.`})
        return
    }
    const wanted = new Set(enabled || [])
    const invalid = [...wanted].filter(id => !TOGGLEABLE_FEATURE_LAYERS.includes(id))
    if (invalid.length) {
        respond({success: false, error: `Unknown feature layer(s): ${invalid.join(', ')}. Toggleable: ${TOGGLEABLE_FEATURE_LAYERS.join(', ')}.`})
        return
    }
    const current = areas[area].featureLayers || []
    const toggled = TOGGLEABLE_FEATURE_LAYERS.map(id => ({
        sourceId: id,
        disabled: !wanted.has(id)
    }))
    // Preserve any other entries (dynamic per-vis legend/palette/values).
    const preserved = current.filter(fl => !TOGGLEABLE_FEATURE_LAYERS.includes(fl.sourceId))
    try {
        recipeActionBuilder(recipeId)('CHAT_SET_FEATURE_LAYERS', {area, enabled: [...wanted]})
            .set(['layers.areas', area, 'featureLayers'], [...toggled, ...preserved])
            .dispatch()
        respond({success: true, data: {recipeId, area, enabled: [...wanted]}})
    } catch (error) {
        respondError({log, respond, fallback: 'Failed to set feature layers', error})
    }
}

const ensureRecipeOpen = (recipeId, respond) => {
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: `Recipe ${recipeId} is not open`})
        return null
    }
    return recipe
}

const geocodeBounds = (query, callback) => {
    const google = window.google
    if (!google?.maps) {
        callback(new Error('Google Maps not loaded yet — wait a moment and retry'))
        return
    }
    const Geocoder = google.maps.Geocoder || google.maps.geocoding?.Geocoder
    if (!Geocoder) {
        callback(new Error('Google Maps Geocoder unavailable'))
        return
    }
    new Geocoder().geocode({address: query}, (results, status) => {
        if (status !== 'OK' || !results?.[0]) {
            callback(new Error(`Geocoding failed for "${query}" (${status})`))
            return
        }
        const viewport = results[0].geometry?.viewport
        if (!viewport) {
            callback(new Error(`No viewport for "${query}"`))
            return
        }
        const ne = viewport.getNorthEast()
        const sw = viewport.getSouthWest()
        callback(null, {
            bounds: [[sw.lng(), sw.lat()], [ne.lng(), ne.lat()]],
            formattedAddress: results[0].formatted_address
        })
    })
}

const zoomToPlace = ({recipeId, query, respond}) => {
    if (!ensureRecipeOpen(recipeId, respond)) return
    if (!query || typeof query !== 'string') {
        respond({success: false, error: 'query is required'})
        return
    }
    geocodeBounds(query, (error, result) => {
        if (error) {
            respond({success: false, error: error.message})
            return
        }
        mapCommand$.next({recipeId, type: 'fitBounds', bounds: result.bounds})
        respond({success: true, data: {recipeId, query, bounds: result.bounds, place: result.formattedAddress}})
    })
}

const setCamera = ({recipeId, center, zoom, respond}) => {
    if (!ensureRecipeOpen(recipeId, respond)) return
    if (!center && zoom === undefined) {
        respond({success: false, error: 'Provide center, zoom, or both'})
        return
    }
    const view = {}
    if (center) view.center = center
    if (zoom !== undefined) view.zoom = zoom
    mapCommand$.next({recipeId, type: 'setView', view})
    respond({success: true, data: {recipeId, view}})
}

const fitBounds = ({recipeId, bounds, respond}) => {
    if (!ensureRecipeOpen(recipeId, respond)) return
    if (!Array.isArray(bounds) || bounds.length !== 2) {
        respond({success: false, error: 'bounds must be [[swLng, swLat], [neLng, neLat]]'})
        return
    }
    mapCommand$.next({recipeId, type: 'fitBounds', bounds})
    respond({success: true, data: {recipeId, bounds}})
}

const setSync = ({recipeId, linked, respond}) => {
    if (!ensureRecipeOpen(recipeId, respond)) return
    mapCommand$.next({recipeId, type: 'setSync', linked: !!linked})
    respond({success: true, data: {recipeId, linked: !!linked}})
}

const activeRecipe = () => {
    const recipeId = select('process.selectedTabId')
    if (!recipeId) return null
    return select(['process.loadedRecipes', recipeId]) || null
}

const unavailable = () => ({available: false, reason: 'no_active_recipe'})

const listMapAreas = ({respond}) => {
    const recipe = activeRecipe()
    if (!recipe) {
        respond({success: true, data: unavailable()})
        return
    }
    const tab = (select('process.tabs') || []).find(t => t.id === recipe.id)
    const layerAreas = recipe.layers?.areas || {}
    const areaKeys = Object.keys(layerAreas)
    const layout = layoutNameOf(areaKeys) || (areaKeys.length ? 'custom' : null)
    const areas = areaKeys.map(area => {
        const sourceId = layerAreas[area]?.imageLayer?.sourceId || null
        return {
            area,
            ...summarizeSource(recipe, sourceId),
            sourceLabel: resolveSourceLabel(recipe, sourceId)
        }
    })
    respond({success: true, data: {
        recipeId: recipe.id,
        recipeName: tab?.title || tab?.placeholder || null,
        recipeType: recipe.type || tab?.type || null,
        layout,
        areas,
        aoi: recipe.model?.aoi || null,
        view: select('map.view') || null
    }})
}

const imageLayerSummary = (recipe, imageLayer) => {
    if (!imageLayer?.sourceId) return null
    const visParams = imageLayer.layerConfig?.visParams
    return {
        ...summarizeSource(recipe, imageLayer.sourceId),
        sourceLabel: resolveSourceLabel(recipe, imageLayer.sourceId),
        ...(visParams ? {visualization: {type: visParams.type || null, bands: visParams.bands || null}} : {})
    }
}

const featureLayerSummaries = featureLayers =>
    (featureLayers || []).map(fl => ({sourceId: fl.sourceId, enabled: !fl.disabled}))

const listLayers = ({respond}) => {
    const recipe = activeRecipe()
    if (!recipe) {
        respond({success: true, data: unavailable()})
        return
    }
    const layerAreas = recipe.layers?.areas || {}
    const areas = Object.entries(layerAreas).map(([area, layer]) => ({
        area,
        imageLayer: imageLayerSummary(recipe, layer?.imageLayer),
        featureLayers: featureLayerSummaries(layer?.featureLayers)
    }))
    respond({success: true, data: {recipeId: recipe.id, areas}})
}

export const registerMapActions = () => {
    registerAction('set-view', setView)
    registerAction('set-image-layer', setImageLayer)
    registerAction('set-feature-layers', setFeatureLayers)
    registerAction('zoom-to-place', zoomToPlace)
    registerAction('set-camera', setCamera)
    registerAction('fit-bounds', fitBounds)
    registerAction('set-sync', setSync)
    registerAction('list-map-areas', listMapAreas)
    registerAction('list-layers', listLayers)
}
