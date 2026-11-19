import _ from 'lodash'
import {firstValueFrom, Subject, switchMap, takeUntil} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {publishEvent} from '~/eventPublisher'
import {gzip$} from '~/gzip'
import {getHash} from '~/hash'
import {selectFrom} from '~/stateUtils'
import {currentStore} from '~/store'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

import {initializeRecipe, saveStatePath} from './recipeCache'
import {RecipeCacheClaimant, RecipeCacheClaims} from './recipeCacheClaims'
import {createSaveCoordinator, SAVED} from './saveCoordinator'

// What a store's session does with the recipes the store holds (`process.loadedRecipes`): saves the open recipes it
// edits (saveCoordinator.js), publishing what is persisted, and counts the claims that keep the others
// (recipeCacheClaims.js). One per store, as long as the store lives - a page load: started with it (index.jsx), shared
// by the UI and the source runtime, and kept whatever panel, tab or screen comes and goes. Logging out, a refused
// request and a login session ending elsewhere all reload the page (user.js, http-client.js, loginSessionMonitor.jsx),
// and so start another store and session.
//
// Everything it does later is applied to its own store: an acknowledgement, a published save state, an entry its last
// claimant releases or a read lands in. What it compares edits against is what its store held - from the store's state
// when the session started - and the revisions it saves on top of are those it opened or was acknowledged.
//
// Disposed, it sends nothing more: a save it queued, or one still being compressed, never starts, and no timer fires.
// A write already sent runs to its end, since storage may have accepted it; nothing it is answered with is applied.
// Its claimants then write and remove nothing.

// Transient view state and the server-owned revision are both not recipe content, so neither leaves the browser as part
// of one.
const NON_CONTENT = ['ui', 'revision']

const RECIPES = 'process.loadedRecipes'

export class RecipeSession {
    #store
    #claims = new RecipeCacheClaims()
    #coordinator
    #compared
    #unsubscribe
    #disposal = new Subject()
    #disposed = false

    // The adapter the session's own claimants read and write its recipe cache through.
    cache = {
        held: recipeId => this.#select([RECIPES, recipeId]),
        open: recipeId => this.#isOpen(recipeId),
        saveState: recipeId => this.#select(saveStatePath(recipeId)),
        write: recipe => this.#dispatch(actionBuilder('CACHE_RECIPE', recipe).set([RECIPES, recipe.id], recipe)),
        remove: recipeId => this.#dispatch(actionBuilder('REMOVE_CACHE_RECIPE', recipeId).del([RECIPES, recipeId]))
    }

    constructor(store) {
        this.#store = store
        this.#coordinator = createSaveCoordinator({
            save: request => this.#post(request),
            loadRecipe: recipeId => firstValueFrom(api.recipe.load$(recipeId)),
            onState: (recipeId, saveState) => this.#publishSaveState(recipeId, saveState),
            onOutcome: outcome => this.#settled(outcome)
        })
        this.#compared = this.#select(RECIPES)
        this.#unsubscribe = store.subscribe(() => this.#autosave())
    }

    // A claimant on this session's cache, through `cache` - another adapter of this store, such as the source runtime's,
    // shares its claims as the session's own does. Once the session is disposed, it writes and removes nothing.
    claimant(cache = this.cache) {
        return new RecipeCacheClaimant({claims: this.#claims, cache: {
            ...cache,
            write: recipe => this.#disposed || cache.write(recipe),
            remove: recipeId => this.#disposed || cache.remove(recipeId)
        }})
    }

    // Seeds saving and freshness from the same authoritative load, whose model is what is persisted at its revision. The
    // model is written on its own path, so the store gives it a change identifier (~/hash) that the published save
    // evidence names it by: the draft then agrees with what was loaded without comparing content (draftAgreement.js).
    openRecipeRevision(loaded) {
        const {model, ...recipe} = initializeRecipe(loaded)
        this.#dispatch(actionBuilder('CACHE_RECIPE', {recipeId: recipe.id})
            .set([RECIPES, recipe.id], recipe)
            .set([RECIPES, recipe.id, 'model'], model))
        this.#coordinator.open(recipe.id, recipe.revision, this.#select([RECIPES, recipe.id, 'model']))
        this.#setCatalogueRevision(recipe.id, recipe.revision)
        return this.#select([RECIPES, recipe.id])
    }

    save(recipe) {
        if (this.#disposed) {
            return
        }
        if (recipe.ui?.unsaved) {
            publishEvent('insert_recipe', {recipe_type: recipe.type})
        }
        this.#coordinator.save(_.omit(recipe, NON_CONTENT))
    }

    forget(recipeId) {
        this.#coordinator.forget(recipeId)
    }

    dispose() {
        if (this.#disposed) {
            return
        }
        this.#disposed = true
        this.#unsubscribe()
        this.#disposal.next()
        this.#disposal.complete()
        this.#coordinator.close()
    }

    // A compression still running when the session is disposed starts no save; a save already sent is not withdrawn.
    #post({recipe, expectedRevision}) {
        return firstValueFrom(gzip$(recipe).pipe(
            takeUntil(this.#disposal),
            switchMap(gzippedContents => api.recipe.save$({
                id: recipe.id,
                projectId: recipe.projectId,
                type: recipe.type,
                name: recipe.title || recipe.placeholder,
                gzippedContents,
                expectedRevision
            }))
        ))
    }

    #settled({recipeId, status, revision, model, error}) {
        if (status === SAVED) {
            this.#adoptRevision(recipeId, revision, model)
            this.#claims.releaseSettled(recipeId, this.cache)
        } else if (status === 'CONFLICT') {
            Notifications.error({timeout: 0, message: msg('process.saveRecipe.conflict'), error})
        } else if (status === 'FAILED' || status === 'UNRESOLVED') {
            Notifications.error({timeout: 0, message: msg('process.saveRecipe.error'), error})
        }
    }

    #publishSaveState(recipeId, saveState) {
        const action = actionBuilder('SET_SAVE_STATE', {recipeId})
        this.#dispatch(saveState ? action.set(saveStatePath(recipeId), publishedSaveState(saveState)) : action.del(saveStatePath(recipeId)))
    }

    // An acknowledged revision is what the server now holds. The open draft carries it only while the draft is the
    // content acknowledged: a newer edit may already be queued, and its revision is not this one. Autosave compares only
    // model, layers and retile, so writing it to the draft cannot provoke another save.
    #adoptRevision(recipeId, revision, model) {
        this.#setCatalogueRevision(recipeId, revision)
        if (this.#select([RECIPES, recipeId, 'model']) === model) {
            this.#dispatch(actionBuilder('SET_DRAFT_REVISION', {recipeId})
                .set([RECIPES, recipeId, 'revision'], revision))
        }
    }

    // Catalogue revisions are freshness evidence; save preconditions come from the coordinator's draft base. They only
    // advance: a revision this session was told of is never replaced by an older one learned earlier.
    #setCatalogueRevision(recipeId, revision) {
        const listed = this.#select(['process.recipes', {id: recipeId}, 'revision'])
        if (Number.isInteger(listed) && listed >= revision) {
            return
        }
        this.#dispatch(actionBuilder('SET_RECIPE_REVISION', {recipeId})
            .set(['process.recipes', {id: recipeId}, 'revision'], revision))
    }

    // Whenever already saved recipes change, save them again. Only a record that is not the one compared before can need
    // saving: a listing or tab change alone changes no record, so it is judged with a record's next change, against the
    // listing and tabs as they are then. Saving publishes state synchronously and re-enters this listener, so the
    // records compared are replaced before anything is saved or acknowledged, and a nested notification finds nothing
    // changed.
    #autosave() {
        const recipes = this.#select(RECIPES)
        if (!recipes || recipes === this.#compared) {
            return
        }
        const previous = this.#compared || {}
        this.#compared = recipes
        const changed = Object.keys(recipes).filter(id => recipes[id] !== previous[id]).map(id => recipes[id])
        if (changed.length) {
            this.#saveChanged(changed, previous)
        }
        this.#forgetReleasedSaveStates(recipes)
    }

    #saveChanged(recipes, previous) {
        const listed = new Set((this.#select('process.recipes') || []).map(({id}) => id))
        const savedLoaded = recipes.filter(({id}) => listed.has(id))
        savedLoaded
            .filter(recipe => this.#isToBeSaved(previous[recipe.id] || {}, recipe))
            .forEach(recipe => this.save(recipe))
        // A new model object holding what the previous one held changes nothing persisted.
        savedLoaded.forEach(recipe => {
            const model = previous[recipe.id]?.model
            if (model && model !== recipe.model && _.isEqual(model, recipe.model)) {
                this.#coordinator.equivalent(recipe.id, model, recipe.model)
            }
        })
    }

    #isToBeSaved(previous, recipe) {
        return persistentProps(previous)
            && !_.isEqual(persistentProps(previous), persistentProps(recipe))
            && this.#isOpen(recipe.id)
    }

    // A closed recipe's save state lasts as long as the session holds the recipe. Its cache entry is released only once
    // nothing claims it and its saves have settled; its revision stays listed, and reopening starts from the load that
    // opens it.
    #forgetReleasedSaveStates(recipes) {
        const saves = this.#select('process.saveStates') || {}
        Object.keys(saves)
            .filter(id => !recipes[id] && saves[id]?.status === SAVED)
            .forEach(id => this.forget(id))
    }

    #isOpen(recipeId) {
        return (this.#select('process.tabs') || []).some(({id}) => id === recipeId)
    }

    #select(path) {
        return selectFrom(this.#store.getState(), path)
    }

    #dispatch(action) {
        this.#store.dispatch(action.build())
    }
}

// Starts the session of a store where the store is installed (index.jsx), so that it sees every change the store goes
// through. Starting it again gives the one started.
export const startRecipeSession = store => {
    if (!SESSIONS.has(store)) {
        SESSIONS.set(store, new RecipeSession(store))
    }
    return SESSIONS.get(store)
}

// The session started with a store. Asking starts none: a session started later would compare edits against what its
// store held by then, and outlive whatever started it unawares.
export const recipeSessionOf = store => {
    const session = SESSIONS.get(store)
    if (!session) {
        throw new Error('No recipe session was started for this store')
    }
    return session
}

// The session of the store installed (~/store), for code acting on it as the user does.
export const currentRecipeSession = () =>
    recipeSessionOf(currentStore())

const SESSIONS = new WeakMap()

const persistentProps = recipe =>
    _.pick(recipe, ['model', 'layers', 'retile'])

// The store copies whatever it is given, and copying the acknowledged model costs more than the save it reports. Its
// change identifier proves the same thing; only a model the store never identified is published, to be compared by
// content (draftAgreement.js).
const publishedSaveState = ({model, ...saveState}) => {
    const modelHash = getHash(model)
    return modelHash ? {...saveState, modelHash} : {...saveState, model}
}
