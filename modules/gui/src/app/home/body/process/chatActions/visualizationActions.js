import {forkJoin} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {registerGuiAction as registerAction} from '~/app/home/body/chat/guiActionRegistry'
import {histogramStretch} from '~/app/home/map/visParams/histogram'
import {getLogger} from '~/log'
import {select} from '~/store'

import {recipePath} from '../recipe'
import {getRecipeVisualizationOptions} from '../recipeVisualizationsRegistry'
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

const listVisualizations = ({recipeId, respond}) => {
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: `Recipe ${recipeId} is not open`})
        return
    }
    const optionsFn = getRecipeVisualizationOptions(recipe.type)
    let groups = []
    try {
        if (optionsFn) groups = optionsFn(recipe) || []
    } catch (error) {
        log.error('Failed to compute visualization options', error)
    }
    const areas = selectedVisualizationAreas(recipe)
    const hasPresets = groups.some(group => (group.options || []).length > 0)
    if (hasPresets) {
        respond({success: true, data: {recipeType: recipe.type, groups, areas}})
        return
    }
    api.gee.bands$({recipe}).subscribe({
        next: bands => respond({success: true, data: {recipeType: recipe.type, groups, areas, bands}}),
        error: error => {
            log.error('Failed to load bands for visualization listing', error)
            respond({success: true, data: {recipeType: recipe.type, groups, areas, bands: []}})
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

const proposeContinuousOrMulti = ({recipe, mode, bands, palette, respond}) => {
    const expected = mode === 'continuous' ? 1 : 3
    if (!validateBandCount({mode, bands, expected, respond})) return
    const aoi = recipe.model?.aoi
    forkJoin(bands.map(band => api.gee.histogram$({recipe, band, aoi}))).subscribe({
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

const proposeCategorical = ({recipe, bands, respond}) => {
    if (!validateBandCount({mode: 'categorical', bands, expected: 1, respond})) return
    const band = bands[0]
    const aoi = recipe.model?.aoi
    api.gee.distinctBandValues$({recipe, band, aoi}).subscribe({
        next: values => {
            if (!Array.isArray(values) || values.length === 0) {
                respond({success: false, error: `No distinct values returned for band '${band}'. The AOI may not overlap the image.`})
                return
            }
            const legend = recipe.model?.legend?.entries || []
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

const proposeVisualization = ({recipeId, mode, bands, palette, respond}) => {
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: `Recipe ${recipeId} is not open`})
        return
    }
    if (mode === 'continuous' || mode === 'rgb' || mode === 'hsv') {
        proposeContinuousOrMulti({recipe, mode, bands, palette, respond})
    } else if (mode === 'categorical') {
        proposeCategorical({recipe, bands, respond})
    } else {
        respond({success: false, error: `Unknown mode '${mode}'. Expected: continuous, rgb, hsv, categorical.`})
    }
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
    try {
        actionBuilder('CHAT_SET_VIS_PARAMS', {recipeId, area})
            .assign(
                [...recipePath(recipeId, 'layers.areas'), area, 'imageLayer.layerConfig'],
                {visParams}
            )
            .dispatch()
        respond({success: true, data: {recipeId, area}})
    } catch (error) {
        respondError({log, respond, fallback: 'Failed to set visualization', error})
    }
}

export const registerVisualizationActions = () => {
    registerAction('list-visualizations', listVisualizations)
    registerAction('set-visualization', setVisualization)
    registerAction('propose-visualization', proposeVisualization)
}
