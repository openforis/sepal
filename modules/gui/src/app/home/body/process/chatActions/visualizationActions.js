import {forkJoin} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {registerGuiAction as registerAction} from '~/app/home/body/chat/guiActionRegistry'
import {histogramStretch} from '~/app/home/map/visParams/histogram'
import {normalize} from '~/app/home/map/visParams/visParams'
import {getLogger} from '~/log'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {uuid} from '~/uuid'

import {recipePath} from '../recipe'
import {getRecipeType} from '../recipeTypeRegistry'
import {respondError} from './response'

const log = getLogger('chat-visualization-actions')

const PALETTES = {
    ndvi: ['#112040', '#1c67a0', '#6db6b3', '#fffccc', '#abac21', '#177228', '#172313'],
    ndwi: ['#F7ECE5', '#C4CA39', '#37B200', '#00834B', '#114E81', '#2C1C5D', '#040404'],
    nbr: ['#0034F5', '#1E7D83', '#4DA910', '#B3C120', '#FCC228', '#FF8410', '#FD3000'],
    rdylgn: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'],
    rdylbu: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'],
    viridis: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
    magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
    sequential: ['#1a1a1a', '#3b3b3b', '#5d5d5d', '#7f7f7f', '#a1a1a1', '#c3c3c3', '#e5e5e5']
}

const PALETTE_ALIASES = {
    vegetation: 'ndvi',
    water: 'ndwi',
    burn: 'nbr'
}

const STRETCH_PERCENT = 96

const resolvePalette = palette => {
    if (Array.isArray(palette) && palette.length > 0) return palette
    if (typeof palette === 'string') {
        const key = palette.toLowerCase()
        const aliased = PALETTE_ALIASES[key] || key
        const resolved = PALETTES[aliased]
        if (resolved) return resolved
    }
    return PALETTES.sequential
}

const selectedVisualizationAreas = recipe => {
    const areas = {}
    const layerAreas = recipe.layers?.areas || {}
    Object.keys(layerAreas).forEach(area => {
        areas[area] = layerAreas[area]?.imageLayer?.layerConfig?.visParams
    })
    return areas
}

const LAYOUTS = [
    {name: 'single', keys: ['center']},
    {name: 'left-right', keys: ['left', 'right']},
    {name: 'top-bottom', keys: ['top', 'bottom']},
    {name: 'top+bottom-split', keys: ['top', 'bottom-left', 'bottom-right']},
    {name: 'bottom+top-split', keys: ['bottom', 'top-left', 'top-right']},
    {name: 'left+right-split', keys: ['left', 'top-right', 'bottom-right']},
    {name: 'right+left-split', keys: ['right', 'top-left', 'bottom-left']},
    {name: 'quadrants', keys: ['top-left', 'top-right', 'bottom-left', 'bottom-right']}
]

const deriveLayout = areaKeys => {
    const sorted = [...areaKeys].sort().join(',')
    const match = LAYOUTS.find(l => [...l.keys].sort().join(',') === sorted)
    return match?.name || 'custom'
}

const visParamsToOption = visParams => {
    const bandLabel = (visParams.bands || []).join(', ')
    return {value: visParams.id || bandLabel, label: bandLabel, visParams}
}

const collectVisualizations = recipe => {
    const recipeType = getRecipeType(recipe.type)
    const availableBands = recipeType?.getAvailableBands?.(recipe) || {}
    const bandKeys = new Set(Object.keys(availableBands))
    const bandFilter = ({bands}) =>
        Array.isArray(bands) && bands.every(b => bandKeys.has(b))
    const userDefined = Object.values(
        selectFrom(recipe, 'layers.userDefinedVisualizations.this-recipe') || {}
    ).filter(bandFilter)
    const presets = (recipeType?.getPreSetVisualizations?.(recipe) || [])
        .filter(bandFilter)
    const groups = []
    if (userDefined.length) {
        groups.push({label: 'User-defined', options: userDefined.map(visParamsToOption)})
    }
    if (presets.length) {
        groups.push({label: 'Presets', options: presets.map(visParamsToOption)})
    }
    return groups
}

const listVisualizations = ({recipeId, respond}) => {
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: `Recipe ${recipeId} is not open`})
        return
    }
    const groups = collectVisualizations(recipe)
    const areas = selectedVisualizationAreas(recipe)
    const layout = deriveLayout(Object.keys(areas))
    const hasPresets = groups.some(group => (group.options || []).length > 0)
    if (hasPresets) {
        respond({success: true, data: {recipeType: recipe.type, layout, groups, areas}})
        return
    }
    api.gee.bands$({recipe}).subscribe({
        next: bands => respond({success: true, data: {recipeType: recipe.type, layout, groups, areas, bands}}),
        error: error => {
            log.error('Failed to load bands for visualization listing', error)
            respond({success: true, data: {recipeType: recipe.type, layout, groups, areas, bands: []}})
        }
    })
}

const validateBandCount = ({mode, bands, expected, respond}) => {
    if (Array.isArray(bands) && bands.length === expected) return true
    respond({
        success: false,
        error: `mode '${mode}' requires exactly ${expected} band${expected === 1 ? '' : 's'}, got ${(bands || []).length}`
    })
    return false
}

const toVisParams = ({mode, bands, palette, stretches}) =>
    mode === 'continuous'
        ? {type: 'continuous', bands, min: [stretches[0].min], max: [stretches[0].max], palette: resolvePalette(palette)}
        : {type: mode, bands, min: stretches.map(s => s.min), max: stretches.map(s => s.max), gamma: bands.map(() => 1)}

const proposeContinuousOrMulti = ({image, aoi, mapBounds, mode, bands, palette, respond}) => {
    const expected = mode === 'continuous' ? 1 : 3
    if (!validateBandCount({mode, bands, expected, respond})) return
    forkJoin(bands.map(band => api.gee.histogram$({recipe: image, band, aoi, mapBounds}))).subscribe({
        next: histograms => {
            const stretches = histograms.map((data, i) => {
                if (!Array.isArray(data) || data.length === 0) {
                    return {min: 0, max: 1, _empty: true, band: bands[i]}
                }
                return histogramStretch(data, STRETCH_PERCENT)
            })
            const empty = stretches.filter(s => s._empty).map(s => s.band)
            if (empty.length) {
                respond({success: false, error: `No data returned for band(s): ${empty.join(', ')}. The AOI may not overlap the image.`})
                return
            }
            respond({success: true, data: {visParams: toVisParams({mode, bands, palette, stretches})}})
        },
        error: error => respondError({log, respond, fallback: 'Failed to compute histogram', error})
    })
}

const proposeCategorical = ({image, aoi, mapBounds, legend, bands, respond}) => {
    if (!validateBandCount({mode: 'categorical', bands, expected: 1, respond})) return
    const band = bands[0]
    api.gee.distinctBandValues$({recipe: image, band, aoi, mapBounds}).subscribe({
        next: values => {
            if (!Array.isArray(values) || values.length === 0) {
                respond({success: false, error: `No distinct values returned for band '${band}'. The AOI may not overlap the image.`})
                return
            }
            const labelByValue = Object.fromEntries(legend.map(e => [e.value, e.label]))
            const colorByValue = Object.fromEntries(legend.map(e => [e.value, e.color]))
            const fallbackPalette = PALETTES.viridis
            respond({
                success: true,
                data: {
                    visParams: {
                        type: 'categorical',
                        bands,
                        values,
                        labels: values.map(v => labelByValue[v] || String(v)),
                        palette: values.map((v, i) =>
                            colorByValue[v] || fallbackPalette[i % fallbackPalette.length]
                        )
                    }
                }
            })
        },
        error: error => respondError({log, respond, fallback: 'Failed to fetch distinct values', error})
    })
}

const proposeVisualization = ({recipeId, mode, bands, palette, imageSource, respond}) => {
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: `Recipe ${recipeId} is not open`})
        return
    }
    // Default = host recipe's own output. When `imageSource` is given, route
    // the histogram / distinct-values call to that foreign source (asset or
    // recipe), but still scope to the host recipe's AOI so the stretch
    // reflects the user's region of interest. Host legend only applies to the
    // host's own output.
    const image = imageSource
        ? {type: imageSource.type, id: imageSource.id}
        : recipe
    const aoi = recipe.model?.aoi
    const legend = imageSource ? [] : (recipe.model?.legend?.entries || [])
    const mapBounds = select('map.view')?.bounds
    if (!mapBounds) {
        respond({success: false, error: 'Map view not ready — wait for the recipe\'s map to finish initializing, then retry.'})
        return
    }
    const availableBands = availableBandsForProposeTarget(recipe, imageSource)
    if (availableBands && Array.isArray(bands)) {
        const missing = bands.filter(b => !availableBands.includes(b))
        if (missing.length) {
            respond({success: false, error: `Bands not available on source: ${missing.join(', ')}. Available: ${availableBands.join(', ')}.`})
            return
        }
    }
    if (mode === 'continuous' || mode === 'rgb' || mode === 'hsv') {
        proposeContinuousOrMulti({image, aoi, mapBounds, mode, bands, palette, respond})
    } else if (mode === 'categorical') {
        proposeCategorical({image, aoi, mapBounds, legend, bands, respond})
    } else {
        respond({success: false, error: `Unknown mode '${mode}'. Expected: continuous, rgb, hsv, categorical.`})
    }
}

const recipeBands = recipe => {
    const recipeType = getRecipeType(recipe.type)
    const bands = recipeType?.getAvailableBands?.(recipe)
    return bands ? Object.keys(bands) : null
}

const assetBands = source =>
    (source?.sourceConfig?.metadata?.bands || [])
        .map(b => b?.id)
        .filter(Boolean)

const availableBandsForSource = (recipe, sourceId) => {
    if (!sourceId) return null
    if (sourceId === 'this-recipe') return recipeBands(recipe)
    const source = (recipe.layers?.additionalImageLayerSources || [])
        .find(s => s.id === sourceId)
    if (!source) return null
    if (source.type === 'Asset') return assetBands(source)
    if (source.type === 'Recipe') {
        const refId = source.sourceConfig?.recipeId
        const refRecipe = refId && select(['process.loadedRecipes', refId])
        return refRecipe ? recipeBands(refRecipe) : null
    }
    return null
}

const availableBandsForProposeTarget = (recipe, imageSource) => {
    if (!imageSource) return recipeBands(recipe)
    if (imageSource.type === 'ASSET') {
        const registered = (recipe.layers?.additionalImageLayerSources || [])
            .find(s => s.type === 'Asset' && s.sourceConfig?.asset === imageSource.id)
        return registered ? assetBands(registered) : null
    }
    if (imageSource.type === 'RECIPE_REF') {
        const refRecipe = imageSource.id && select(['process.loadedRecipes', imageSource.id])
        return refRecipe ? recipeBands(refRecipe) : null
    }
    return null
}

const setVisualization = ({recipeId, area, visParams, respond}) => {
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: `Recipe ${recipeId} is not open`})
        return
    }
    const layerAreas = recipe.layers?.areas || {}
    if (!layerAreas[area]) {
        const available = Object.keys(layerAreas).join(', ') || '(none)'
        respond({success: false, error: `Unknown area "${area}". Available areas: ${available}`})
        return
    }
    const sourceId = layerAreas[area]?.imageLayer?.sourceId
    if (!sourceId) {
        respond({success: false, error: `Area "${area}" has no image source assigned. Use map_set_image_layer first.`})
        return
    }
    const available = availableBandsForSource(recipe, sourceId)
    if (available && Array.isArray(visParams?.bands)) {
        const missing = visParams.bands.filter(b => !available.includes(b))
        if (missing.length) {
            respond({success: false, error: `Bands not available on source: ${missing.join(', ')}. Available: ${available.join(', ')}.`})
            return
        }
    }
    // Run the same normalizer the form-driven visualization editor uses:
    // pads min/max/gamma to bands length, resolves color names to hex,
    // derives min/max from values for categorical, applies palette defaults,
    // resolves the gamma-vs-palette exclusivity. Returns null if bands is empty.
    let normalized
    try {
        normalized = normalize({
            ...visParams,
            id: visParams?.id || uuid(),
            userDefined: true
        })
    } catch (error) {
        respondError({log, respond, fallback: 'Invalid visParams', error})
        return
    }
    if (!normalized) {
        respond({success: false, error: 'visParams.bands is empty after normalization'})
        return
    }
    try {
        actionBuilder('CHAT_SET_VIS_PARAMS', {recipeId, area})
            .set(
                [...recipePath(recipeId, 'layers.userDefinedVisualizations'), sourceId, {id: normalized.id}],
                normalized
            )
            .assign(
                [...recipePath(recipeId, 'layers.areas'), area, 'imageLayer.layerConfig'],
                {visParams: normalized}
            )
            .dispatch()
        respond({success: true, data: {recipeId, area, visParams: normalized}})
    } catch (error) {
        respondError({log, respond, fallback: 'Failed to set visualization', error})
    }
}

export const registerVisualizationActions = () => {
    registerAction('list-visualizations', listVisualizations)
    registerAction('set-visualization', setVisualization)
    registerAction('propose-visualization', proposeVisualization)
}
