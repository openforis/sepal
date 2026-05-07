import {map, of, tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {registerChatGuiAction} from '~/app/home/body/chat/chatGuiActionRegistry'
import {countryEETable} from '~/app/home/map/aoiLayer'
import {getLogger} from '~/log'
import {select} from '~/store'

import {closeRecipe, initializeRecipe, isRecipeOpen, recipePath, selectRecipe} from './recipe'
import {getRecipeVisualizationOptions} from './recipeVisualizationsRegistry'

const log = getLogger('chat-gui-actions')

let pendingRecipeSubscription = null

const cancelPendingRecipeSubscription = () => {
    if (pendingRecipeSubscription) {
        pendingRecipeSubscription.unsubscribe()
        pendingRecipeSubscription = null
    }
}

const openExistingRecipe = ({recipeId}) => {
    if (isRecipeOpen(recipeId)) {
        selectRecipe(recipeId)
        return
    }
    const loadedRecipes = select('process.loadedRecipes') || {}
    const recipe$ = Object.keys(loadedRecipes).includes(recipeId)
        ? of(loadedRecipes[recipeId])
        : api.recipe.load$(recipeId).pipe(
            map(recipe => initializeRecipe(recipe)),
            tap(recipe =>
                actionBuilder('CACHE_RECIPE', recipe)
                    .set(['process.loadedRecipes', recipe.id], recipe)
                    .dispatch()
            )
        )
    cancelPendingRecipeSubscription()
    pendingRecipeSubscription = recipe$.subscribe({
        next: recipe => {
            const {id, placeholder, title, type} = recipe
            actionBuilder('OPEN_RECIPE')
                .set(['process.tabs', {id: select('process.selectedTabId')}], {id, placeholder, title, type})
                .set('process.selectedTabId', id)
                .dispatch()
        },
        error: error => log.error('Failed to open recipe', error)
    })
}

const reloadRecipe = ({recipeId}) => {
    cancelPendingRecipeSubscription()
    pendingRecipeSubscription = api.recipe.load$(recipeId).subscribe({
        next: loaded => {
            const current = select(['process.loadedRecipes', recipeId]) || {}
            const merged = {
                ...loaded,
                layers: loaded.layers?.areas ? loaded.layers : current.layers,
                ui: current.ui || {initialized: true}
            }
            actionBuilder('RELOAD_RECIPE', {recipeId})
                .set(['process.loadedRecipes', recipeId], merged)
                .dispatch()
        },
        error: error => log.error('Failed to reload recipe', error)
    })
}

const listVisualizations = ({recipeId, respond}) => {
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: `Recipe ${recipeId} is not open`})
        return
    }
    const optionsFn = getRecipeVisualizationOptions(recipe.type)
    if (!optionsFn) {
        respond({success: false, error: `Recipe type ${recipe.type} does not expose selectable band combinations`})
        return
    }
    try {
        const groups = optionsFn(recipe)
        const areas = {}
        const layerAreas = recipe.layers?.areas || {}
        Object.keys(layerAreas).forEach(area => {
            areas[area] = layerAreas[area]?.imageLayer?.layerConfig?.visParams
        })
        respond({success: true, data: {recipeType: recipe.type, groups, areas}})
    } catch (error) {
        log.error('Failed to list visualizations', error)
        respond({success: false, error: error.message || 'Failed to list visualizations'})
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
        log.error('Failed to set visualization', error)
        respond({success: false, error: error.message || 'Failed to set visualization'})
    }
}

const toCountryAoi = ({value, label}) => ({
    label,
    aoi: {type: 'EE_TABLE', id: countryEETable, keyColumn: 'id', key: value, level: 'COUNTRY', buffer: 0}
})

const toAreaAoi = ({value, label}) => ({
    label,
    aoi: {type: 'EE_TABLE', id: countryEETable, keyColumn: 'id', key: value, level: 'AREA', buffer: 0}
})

const listCountries = ({respond}) => {
    const cached = select('countries')
    if (cached) {
        respond({success: true, data: cached.map(toCountryAoi)})
        return
    }
    api.gee.queryEETable$({
        select: ['id', 'label'],
        from: countryEETable,
        where: [['parent_id', 'equals', null]],
        distinct: ['id'],
        orderBy: ['label']
    }).subscribe({
        next: rows => {
            const countries = rows.map(({id, label}) => ({value: id, label}))
            actionBuilder('SET_COUNTRIES', {countries})
                .set('countries', countries)
                .dispatch()
            respond({success: true, data: countries.map(toCountryAoi)})
        },
        error: error => {
            log.error('Failed to load countries', error)
            respond({success: false, error: error.message || 'Failed to load countries'})
        }
    })
}

const listCountryAreas = ({countryId, respond}) => {
    if (!countryId) {
        respond({success: false, error: 'countryId is required'})
        return
    }
    const cached = select(['areasByCountry', countryId])
    if (cached) {
        respond({success: true, data: cached.map(toAreaAoi)})
        return
    }
    api.gee.queryEETable$({
        select: ['id', 'label'],
        from: countryEETable,
        where: [['parent_id', 'equals', countryId]],
        orderBy: ['label']
    }).subscribe({
        next: rows => {
            const areas = rows.map(({id, label}) => ({value: id, label}))
            actionBuilder('SET_COUNTRY_AREA', {countryId, areas})
                .set(['areasByCountry', countryId], areas)
                .dispatch()
            respond({success: true, data: areas.map(toAreaAoi)})
        },
        error: error => {
            log.error('Failed to load country areas', error)
            respond({success: false, error: error.message || 'Failed to load country areas'})
        }
    })
}

export const registerChatGuiActions = () => {
    registerChatGuiAction('open', openExistingRecipe)
    registerChatGuiAction('reload', reloadRecipe)
    registerChatGuiAction('close', ({recipeId}) => closeRecipe(recipeId))
    registerChatGuiAction('list-visualizations', listVisualizations)
    registerChatGuiAction('set-visualization', setVisualization)
    registerChatGuiAction('list-countries', listCountries)
    registerChatGuiAction('list-country-areas', listCountryAreas)
}
