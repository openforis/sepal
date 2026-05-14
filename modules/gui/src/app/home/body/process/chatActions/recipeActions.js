import _ from 'lodash'
import {map, of, switchMap, tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {registerGuiAction as registerAction} from '~/app/home/body/chat/guiActionRegistry'
import {gzip$} from '~/gzip'
import {addHash, getHash} from '~/hash'
import {getLogger} from '~/log'
import {select} from '~/store'
import {uuid} from '~/uuid'

import {
    closeRecipe,
    initializeRecipe,
    isRecipeOpen,
    loadRecipes$,
    moveRecipes$,
    openRecipeInNewTab,
    removeRecipes$,
    selectRecipe
} from '../recipe'
import {getRecipeType} from '../recipeTypeRegistry'
import {respondError} from './response'

const log = getLogger('chat-recipe-actions')

// Wholesale-set into `process.loadedRecipes` (the actionBuilder.set below)
// stamps a fresh hash on the recipe top-level via the mutator, but leaves
// nested fields' hashes alone. Dependent-layer reload detection in
// `recipe/recipeImageLayer.jsx` and `recipe/aoi.jsx` watches
// `getHash(recipe.model)`, which only auto-bumps for path-based mutations.
// Stamp it explicitly so a chat-driven model change is visible to those
// watchers across tabs.
const stampedForSave = recipe => {
    addHash(recipe.model)
    return recipe
}

// When a recipe declares `getDependentRecipeIds` (e.g. indexChange.fromImage),
// chat-driven create/save bypasses the InputImage form that normally registers
// those deps in `layers.additionalImageLayerSources`. Mirror that registration
// here so the map's image-source dropdown reflects the model.
const withDependentSourcesRegistered = recipe => {
    const recipeType = getRecipeType(recipe.type)
    const depIds = recipeType?.getDependentRecipeIds?.(recipe) || []
    if (!depIds.length) return recipe
    const existing = recipe.layers?.additionalImageLayerSources || []
    const existingIds = new Set(existing.map(s => s.id))
    const additions = depIds
        .filter(id => !existingIds.has(id))
        .map(id => ({
            id,
            type: 'Recipe',
            sourceConfig: {recipeId: id}
        }))
    if (!additions.length) return recipe
    return {
        ...recipe,
        layers: {
            ...(recipe.layers || {}),
            additionalImageLayerSources: [...existing, ...additions]
        }
    }
}

let pendingRecipeSubscription = null

const cancelPendingRecipeSubscription = () => {
    if (pendingRecipeSubscription) {
        pendingRecipeSubscription.unsubscribe()
        pendingRecipeSubscription = null
    }
}

const recipeSummary = recipe => ({
    id: recipe.id,
    type: recipe.type,
    name: recipe.title || recipe.placeholder || recipe.name,
    projectId: recipe.projectId
})

// Treat missing OR empty as not-yet-loaded: an empty `process.recipes` can mean
// "never loaded in this context", and chat list tools must still fetch.
const ensureRecipesLoaded$ = () =>
    select('process.recipes')?.length ? of(null) : loadRecipes$()

const ensureRecipeOpenAndSelected = recipe => {
    if (select('process.selectedTabId') === recipe.id) return
    if (isRecipeOpen(recipe.id)) {
        selectRecipe(recipe.id)
    } else {
        openRecipeInNewTab(recipe)
    }
}

const savedRecipeState = recipe => ({
    ...recipe,
    ui: _.omit(recipe.ui || {}, ['unsaved'])
})

const persistRecipe$ = recipe =>
    gzip$(_.omit(recipe, ['ui'])).pipe(
        switchMap(gzipped =>
            api.recipe.save$({
                id: recipe.id,
                projectId: recipe.projectId,
                type: recipe.type,
                name: recipe.title || recipe.placeholder,
                gzippedContents: gzipped
            })
        ),
        map(() => savedRecipeState(recipe))
    )

const loadRecipeFromCacheOrServer$ = recipeId => {
    const loaded = select(['process.loadedRecipes', recipeId])
    return loaded ? of(loaded) : api.recipe.load$(recipeId).pipe(map(initializeRecipe))
}

const createRecipe = ({type, name, projectId, model, respond}) => {
    const id = uuid()
    const recipe = {
        id,
        type,
        title: name,
        projectId,
        model,
        ui: {initialized: true}
    }
    cancelPendingRecipeSubscription()
    pendingRecipeSubscription = persistRecipe$(recipe).subscribe({
        next: saved => {
            const enriched = withDependentSourcesRegistered(saved)
            actionBuilder('CHAT_CREATE_RECIPE', {id})
                .assign(['process.recipes', {id}], {
                    id, projectId, name, type
                })
                .set(['process.loadedRecipes', id], stampedForSave(enriched))
                .dispatch()
            ensureRecipeOpenAndSelected(enriched)
            respond({success: true, data: recipeSummary(enriched)})
        },
        error: error => respondError({log, respond, fallback: 'Failed to create recipe', error})
    })
}

const updateRecipe = ({recipeId, model, respond}) => {
    cancelPendingRecipeSubscription()
    pendingRecipeSubscription = loadRecipeFromCacheOrServer$(recipeId).pipe(
        switchMap(existing => persistRecipe$({...existing, model}))
    ).subscribe({
        next: saved => {
            const enriched = withDependentSourcesRegistered(saved)
            actionBuilder('CHAT_SAVE_RECIPE', {id: enriched.id})
                .assign(['process.recipes', {id: enriched.id}], {
                    id: enriched.id,
                    projectId: enriched.projectId,
                    name: enriched.title || enriched.placeholder,
                    type: enriched.type
                })
                .set(['process.loadedRecipes', enriched.id], stampedForSave(enriched))
                .dispatch()
            ensureRecipeOpenAndSelected(enriched)
            respond({success: true, data: recipeSummary(enriched)})
        },
        error: error => respondError({log, respond, fallback: 'Failed to save recipe', error})
    })
}

// modelHash feeds the later recipe_patch concurrency contract. The model is
// hash-stamped at load time (initializeRecipe), so this stays a pure read.
const loadRecipe = ({recipeId, respond}) => {
    loadRecipeFromCacheOrServer$(recipeId).subscribe({
        next: recipe => {
            const {ui: _ui, layers: _layers, ...rest} = recipe
            respond({success: true, data: {...rest, modelHash: getHash(recipe.model)}})
        },
        error: error => respondError({log, respond, fallback: 'Failed to load recipe', error})
    })
}

const listRecipes = ({type, projectId, respond}) => {
    ensureRecipesLoaded$().subscribe({
        next: () => {
            let recipes = select('process.recipes') || []
            if (type) recipes = recipes.filter(r => r.type === type)
            if (projectId) recipes = recipes.filter(r => r.projectId === projectId)
            respond({success: true, data: recipes})
        },
        error: error => respondError({log, respond, fallback: 'Failed to list recipes', error})
    })
}

const deleteRecipes = ({recipeIds, respond}) => {
    removeRecipes$(recipeIds).subscribe({
        next: () => {
            recipeIds.forEach(id => isRecipeOpen(id) && closeRecipe(id))
            respond({success: true, data: {deleted: recipeIds}})
        },
        error: error => respondError({log, respond, fallback: 'Failed to delete recipes', error})
    })
}

const moveRecipes = ({recipeIds, projectId, respond}) => {
    moveRecipes$(recipeIds, projectId).subscribe({
        next: () => respond({success: true, data: {moved: recipeIds, projectId}}),
        error: error => respondError({log, respond, fallback: 'Failed to move recipes', error})
    })
}

const openExistingRecipe = ({recipeId}) => {
    if (isRecipeOpen(recipeId)) {
        selectRecipe(recipeId)
        return
    }
    loadRecipeFromCacheOrServer$(recipeId).pipe(
        tap(recipe =>
            actionBuilder('CACHE_RECIPE', recipe)
                .set(['process.loadedRecipes', recipe.id], recipe)
                .dispatch()
        )
    ).subscribe({
        next: recipe => openRecipeInNewTab(recipe),
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
                .set(['process.loadedRecipes', recipeId], stampedForSave(withDependentSourcesRegistered(merged)))
                .dispatch()
        },
        error: error => log.error('Failed to reload recipe', error)
    })
}

export const registerRecipeActions = () => {
    registerAction('open', openExistingRecipe)
    registerAction('reload', reloadRecipe)
    registerAction('close', ({recipeId}) => closeRecipe(recipeId))
    registerAction('create-recipe', createRecipe)
    registerAction('save-recipe', updateRecipe)
    registerAction('load-recipe', loadRecipe)
    registerAction('list-recipes', listRecipes)
    registerAction('delete-recipes', deleteRecipes)
    registerAction('move-recipes', moveRecipes)
}
