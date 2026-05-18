import {getRecipeSpec, toEffectiveModel} from '#sepal/recipe'
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
import {applyJsonPatch, JsonPatchApplyError, JsonPatchInvalidError} from './jsonPatch'
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

// Stubbed: applies + validates a JSON Patch against the effective recipe
// model, but does not persist or mutate loadedRecipes. The next slice flips
// the stub by replacing recipe.model with the post-apply effective model and
// routing through the same write path createRecipe/updateRecipe use.
const recipePatch = ({recipeId, baseModelHash, operations, respond}) => {
    if (typeof recipeId !== 'string' || typeof baseModelHash !== 'string' || !Array.isArray(operations)) {
        respond({success: false, error: {code: 'INVALID_PATCH', message: 'recipeId, baseModelHash and operations are required'}})
        return
    }
    const recipe = select(['process.loadedRecipes', recipeId])
    if (!recipe) {
        respond({success: false, error: {code: 'RECIPE_NOT_FOUND', message: `Recipe not found: ${recipeId}`}})
        return
    }
    const currentModelHash = getHash(recipe.model)
    if (currentModelHash !== baseModelHash) {
        log.info(`recipe-patch r=${recipeId} stale base=${baseModelHash} current=${currentModelHash}`)
        respond({success: false, error: {
            code: 'STALE_WRITE',
            message: `baseModelHash mismatch: base=${baseModelHash} current=${currentModelHash}`,
            currentModelHash
        }})
        return
    }
    const effective = toEffectiveModel(recipe.type, recipe.model)
    let after
    try {
        after = applyJsonPatch(effective, operations)
    } catch (error) {
        if (error instanceof JsonPatchInvalidError) {
            log.info(`recipe-patch r=${recipeId} invalid ops=${operations.length} reason=${error.message}`)
            respond({success: false, error: {code: 'INVALID_PATCH', message: error.message}})
            return
        }
        if (error instanceof JsonPatchApplyError) {
            log.info(`recipe-patch r=${recipeId} apply-failed ops=${operations.length} reason=${error.message}`)
            respond({success: false, error: {code: 'PATCH_APPLY_FAILED', message: error.message}})
            return
        }
        throw error
    }
    const spec = getRecipeSpec(recipe.type)
    if (spec) {
        const errors = spec.validate(after)
        if (errors.length > 0) {
            log.info(`recipe-patch r=${recipeId} validation-failed ops=${operations.length} errors=${errors.length}`)
            respond({success: false, error: {
                code: 'VALIDATION_FAILED',
                message: `${errors.length} validation error${errors.length === 1 ? '' : 's'}`,
                errors
            }})
            return
        }
    }
    const invalidatedPaths = patchInvalidatedPaths(operations)
    let newModelHash
    if (_.isEqual(after, effective)) {
        newModelHash = baseModelHash
    } else {
        addHash(after)
        newModelHash = getHash(after)
    }
    log.info(`recipe-patch r=${recipeId} ok ops=${operations.length} paths=${invalidatedPaths.join(',')}`)
    respond({success: true, data: {
        summary: `Applied ${operations.length} operation${operations.length === 1 ? '' : 's'} to recipe ${recipeId}.`,
        modelHash: newModelHash,
        invalidatedPaths
    }})
}

const patchInvalidatedPaths = operations => {
    const set = new Set()
    operations.forEach(op => {
        if (typeof op.path === 'string') set.add(op.path)
        if (typeof op.from === 'string') set.add(op.from)
    })
    return [...set]
}

// Cheap identity-only lookup for dispatcher-side type resolution (the AI
// module's recipe-specialist routing). Reuses the same `process.recipes`
// list-recipes draws on — no model fetch, no gzip envelope. Never exposed
// as an LLM-callable tool.
const recipeMetadata = ({recipeId, respond}) => {
    if (!recipeId) {
        respond({success: false, error: 'recipeId is required'})
        return
    }
    ensureRecipesLoaded$().subscribe({
        next: () => {
            const recipes = select('process.recipes') || []
            const recipe = recipes.find(r => r.id === recipeId)
            if (!recipe) {
                respond({success: false, error: {code: 'RECIPE_NOT_FOUND', message: `Recipe not found: ${recipeId}`}})
                return
            }
            respond({success: true, data: recipeSummary(recipe)})
        },
        error: error => respondError({log, respond, fallback: 'Failed to look up recipe metadata', error})
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

const openExistingRecipe = ({recipeId, respond}) => {
    if (!recipeId) {
        respond?.({success: false, error: 'recipeId is required'})
        return
    }
    const respondOpened = recipe =>
        respond?.({success: true, data: recipeSummary(recipe || {id: recipeId})})
    if (isRecipeOpen(recipeId)) {
        selectRecipe(recipeId)
        respondOpened(select(['process.loadedRecipes', recipeId]) || (select('process.recipes') || []).find(recipe => recipe.id === recipeId))
        return
    }
    loadRecipeFromCacheOrServer$(recipeId).pipe(
        tap(recipe =>
            actionBuilder('CACHE_RECIPE', recipe)
                .set(['process.loadedRecipes', recipe.id], recipe)
                .dispatch()
        )
    ).subscribe({
        next: recipe => {
            openRecipeInNewTab(recipe)
            respondOpened(recipe)
        },
        error: error => respond
            ? respondError({log, respond, fallback: 'Failed to open recipe', error})
            : log.error('Failed to open recipe', error)
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
    registerAction('recipe-patch', recipePatch)
    registerAction('recipe-metadata', recipeMetadata)
    registerAction('list-recipes', listRecipes)
    registerAction('delete-recipes', deleteRecipes)
    registerAction('move-recipes', moveRecipes)
}
