import _ from 'lodash'
import React from 'react'
import {catchError, defer, firstValueFrom, map, of, switchMap, throwError} from 'rxjs'

import {actionBuilder, scopedActionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {publishEvent} from '~/eventPublisher'
import {gzip$} from '~/gzip'
import {getHash} from '~/hash'
import {serialize} from '~/serialize'
import {selectFrom} from '~/stateUtils'
import {select, subscribe} from '~/store'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {downloadObjectZip$} from '~/widget/download'
import {Notifications} from '~/widget/notifications'
import {addTab, closeTab} from '~/widget/tabs/tabActions'

import {isDraft} from './draftAgreement'
import {initializeRecipe, saveStatePath} from './recipeCache'
import {releaseSettled} from './recipeCacheClaims'
import {
    failedListing,
    LISTING_STATE_PATH,
    listingRequest,
    mergedListing,
    refreshedListing,
    refreshingListing,
    touchedListing
} from './recipeListing'
import {createSaveCoordinator, SAVED} from './saveCoordinator'

export {saveStatePath} from './recipeCache'

// Transient view state and the server-owned revision are both not recipe content, so neither leaves the
// browser as part of one.
const NON_CONTENT = ['ui', 'revision']

export const recipePath = (recipeId, path) =>
    ['process.loadedRecipes', recipeId, path]

export const tabPath = id =>
    ['process.tabs', {id}]

export const recipeActionBuilder = id => {
    if (!id) {
        throw new Error(`Creating recipeActionBuilder without valid recipe id: '${id}'`)
    }
    return scopedActionBuilder(recipePath(id))
}

export const RecipeState = recipeId =>
    isRecipeOpen(recipeId)
        ? path => select(recipePath(recipeId, path))
        : null

export const setInitialized = recipeId => {
    actionBuilder('SET_RECIPE_INITIALIZED', recipeId)
        .set(recipePath(recipeId, 'ui.initialized'), true)
        .dispatch()
    const recipe = select(recipePath(recipeId))
    const tab = select(tabPath(recipeId))
    if (tab.title)
        saveRecipe({
            ...recipe,
            title: tab.title
        })
}

const updateRecipeList = recipe =>
    actionBuilder('SET_RECIPES')
        .assign(['process.recipes', {id: recipe.id}], {
            id: recipe.id,
            projectId: recipe.projectId,
            name: recipe.title || recipe.placeholder,
            type: recipe.type
        })
        .set(LISTING_STATE_PATH, touched([recipe.id]))
        .dispatch()

// Stamps a local change to which recipes are listed, so a listing refresh already in flight does not undo it.
const touched = recipeIds =>
    touchedListing(select(LISTING_STATE_PATH), recipeIds)

const isInitialized = recipe =>
    selectFrom(recipe, 'ui.initialized')

export const saveRecipe = tab => {
    const loadedRecipe = select(recipePath(tab.id))
    if (!loadedRecipe) {
        return
    }
    const recipe = {...loadedRecipe, title: tab.title}
    if (isInitialized(recipe)) {
        actionBuilder('SET_RECIPE_SAVED', recipe.id)
            .del(recipePath(recipe.id, 'ui.unsaved'))
            .set(recipePath(recipe.id, 'title'), recipe.title)
            .dispatch()
        updateRecipeList(recipe)
        save$.next(recipe)
    } else {
        // A recipe still in its setup wizard is not saved yet, but its exports are already named after its title.
        actionBuilder('SET_RECIPE_TITLE', recipe.id)
            .set(recipePath(recipe.id, 'title'), recipe.title)
            .dispatch()
    }
}

// Seed saving and freshness from the same authoritative load, whose model is what is persisted at its revision. The
// model is written on its own path, so the store gives it a change identifier (~/hash) that the published save evidence
// names it by: the draft then agrees with what was loaded without comparing content (draftAgreement.js).
export const openRecipeRevision = loaded => {
    const {model, ...recipe} = initializeRecipe(loaded)
    actionBuilder('CACHE_RECIPE', {recipeId: recipe.id})
        .set(recipePath(recipe.id), recipe)
        .set(recipePath(recipe.id, 'model'), model)
        .dispatch()
    saveCoordinator.open(recipe.id, recipe.revision, select(recipePath(recipe.id, 'model')))
    setCatalogueRevision(recipe.id, recipe.revision)
    return select(recipePath(recipe.id))
}

export const forgetRecipeSaveState = recipeId =>
    saveCoordinator.forget(recipeId)

// Leaving the page loses a recipe never saved, and any edit storage has not acknowledged: one still saving, or one
// whose save was refused, conflicted or went unresolved - whether or not its recipe is still open.
export const hasUnsavedWork = state => {
    const loadedRecipes = selectFrom(state, 'process.loadedRecipes') || {}
    const saves = selectFrom(state, 'process.saveStates') || {}
    return Object.values(loadedRecipes).some(recipe => recipe.ui?.unsaved)
        || Object.values(saves).some(({status}) => status !== SAVED)
}

export const closeRecipe = id =>
    closeTab(id, 'process')

export const exportRecipe$ = recipe =>
    downloadObjectZip$({
        filename: `${recipe.title || recipe.placeholder}.json`,
        data: serialize(_.omit(recipe, NON_CONTENT))
    })

export const loadProjects$ = () =>
    api.project.loadAll$().pipe(
        map(projects => actionBuilder('SET_PROJECTS', {projects})
            .set('process.projects', projects)
            .dispatch())
    )

// The first listing of the session, merged like any other (recipeListing.js). Its evidence dates from when it was asked
// for, and while it is in flight no other refresh is started.
export const loadRecipes$ = () => defer(() => {
    const request = startListingRequest()
    setListingState(refreshingListing(select(LISTING_STATE_PATH), request.startedAt))
    return api.recipe.loadAll$().pipe(
        map(response => {
            const {recipes, listingState} = mergeListing(request, response)
            actionBuilder('SET_RECIPES', {recipes})
                .set('process.recipes', recipes)
                .set(LISTING_STATE_PATH, refreshedListing(listingState))
                .dispatch()
        }),
        catchError(error => {
            setListingState(failedListing(select(LISTING_STATE_PATH), error))
            return throwError(() => error)
        })
    )
})

const setListingState = listingState =>
    actionBuilder('SET_RECIPE_LISTING').set(LISTING_STATE_PATH, listingState).dispatch()

// A listing answered by storage, merged with what this session did while it was asked for.
export const startListingRequest = () => listingRequest({
    listingState: select(LISTING_STATE_PATH), saves: select('process.saveStates'), now: Date.now()
})

export const mergeListing = (request, response) => mergedListing({
    recipes: select('process.recipes') || [],
    listingState: select(LISTING_STATE_PATH) || {},
    saves: select('process.saveStates') || {},
    response,
    ...request,
    now: Date.now()
})

export const openRecipe = (recipe, {inNewTab = false} = {}) => {
    publishEvent('load_recipe', {recipe_type: recipe.type})
    const {id, placeholder, title, type} = recipe
    const action = actionBuilder('OPEN_RECIPE')
    ;(inNewTab
        ? action.push('process.tabs', {id, placeholder, title, type})
        : action.set(tabPath(select('process.selectedTabId')), {id, placeholder, title, type}))
        .set('process.selectedTabId', id)
        .dispatch()
}

// Navigation loads authoritative content and its save revision together, unless the session owns a draft.
// Check again on arrival: another caller may have opened or edited the recipe while this read was in flight.
export const openRecipeById$ = (recipeId, {inNewTab = true} = {}) => defer(() => {
    const originatingTabId = select('process.selectedTabId')
    const retainedDraft = () => {
        const held = select(recipePath(recipeId))
        return held && (held.ui?.unsaved || isDraft({
            open: isRecipeOpen(recipeId), saveState: select(saveStatePath(recipeId))
        })) ? held : null
    }
    const held = retainedDraft()
    return (held ? of(held) : api.recipe.load$(recipeId)).pipe(
        map(loaded => {
            if (isRecipeOpen(recipeId)) {
                selectRecipe(recipeId)
                return select(recipePath(recipeId))
            }
            const recipe = retainedDraft() || openRecipeRevision(loaded)
            openRecipe(recipe, {inNewTab: inNewTab || select('process.selectedTabId') !== originatingTabId})
            return recipe
        })
    )
})

export const selectRecipe = recipeId =>
    actionBuilder('SELECT_RECIPE')
        .set('process.selectedTabId', recipeId)
        .dispatch()

export const duplicateRecipe = sourceRecipe => {
    publishEvent('duplicate_recipe', {recipe_type: sourceRecipe.type})
    return addRecipe(recipeCopy(sourceRecipe))
}

export const duplicateRecipe$ = (sourceRecipeId, destinationRecipeId) =>
    api.recipe.load$(sourceRecipeId).pipe(
        map(sourceRecipe => duplicateRecipe(sourceRecipe, destinationRecipeId))
    )

export const removeRecipes$ = recipeIds =>
    api.recipe.remove$(recipeIds).pipe(
        map(() =>
            _.transform(recipeIds, (actionBuilder, recipeId) => {
                forgetRecipeSaveState(recipeId)
                actionBuilder
                    .del(['process.recipes', {id: recipeId}])
                    .del(['process.loadedRecipes', recipeId])
            }, actionBuilder('REMOVE_RECIPES', {recipeIds}).set(LISTING_STATE_PATH, touched(recipeIds))).dispatch()
        )
    )

export const moveRecipes$ = (recipeIds, projectId) => {
    const loadedRecipes = select('process.loadedRecipes') || []
    const request = startListingRequest()
    return api.recipe.move$(recipeIds, projectId).pipe(
        map(response => {
            const {recipes, listingState} = mergeListing(request, response)
            recipeIds
                .filter(id => loadedRecipes[id])
                .reduce(
                    (builder, id) => builder.set(['process.loadedRecipes', id, 'projectId'], projectId),
                    actionBuilder('MOVE_RECIPES', {recipeIds, projectId})
                        .set('process.recipes', recipes)
                        .set(LISTING_STATE_PATH, touchedListing(listingState, recipeIds))
                ).dispatch()
        })
    )
}

export const addRecipe = recipe => {
    const tab = addTab('process')
    recipe.id = tab.id
    const {id, placeholder, title, type} = recipe
    return actionBuilder('SELECT_RECIPE')
        .set(tabPath(recipe.id), {id, placeholder, title, type})
        .set(recipePath(recipe.id), recipe)
        .set('process.selectedTabId', recipe.id)
        .dispatch()
}

export const isRecipeOpen = recipeId =>
    select('process.tabs').findIndex(recipe => recipe.id === recipeId) > -1

// The session's recipe cache, as its claimants use it (recipeCacheClaims.js).
export const sessionRecipeCache = {
    held: recipeId => select(recipePath(recipeId)),
    open: recipeId => isRecipeOpen(recipeId),
    saveState: recipeId => select(saveStatePath(recipeId)),
    write: recipe => actionBuilder('CACHE_RECIPE', recipe)
        .set(['process.loadedRecipes', recipe.id], recipe)
        .dispatch(),
    remove: recipeId => actionBuilder('REMOVE_CACHE_RECIPE', recipeId)
        .del(['process.loadedRecipes', recipeId])
        .dispatch()
}

const save$ = {
    next: recipe => {
        if (recipe.ui.unsaved) {
            publishEvent('insert_recipe', {recipe_type: recipe.type})
        }
        saveCoordinator.save(_.omit(recipe, NON_CONTENT))
    }
}

const saveCoordinator = createSaveCoordinator({
    save: request => postRecipe(request),
    loadRecipe: recipeId => firstValueFrom(api.recipe.load$(recipeId)),
    onState: (recipeId, saveState) => publishSaveState(recipeId, saveState),
    onOutcome: ({recipeId, status, revision, model, error}) => {
        if (status === 'SAVED') {
            adoptRevision(recipeId, revision, model)
            releaseSettled(recipeId, sessionRecipeCache)
        } else if (status === 'CONFLICT') {
            Notifications.error({timeout: 0, message: msg('process.saveRecipe.conflict'), error})
        } else if (status === 'FAILED' || status === 'UNRESOLVED') {
            Notifications.error({timeout: 0, message: msg('process.saveRecipe.error'), error})
        }
    }
})

const postRecipe = ({recipe, expectedRevision}) => firstValueFrom(
    gzip$(recipe).pipe(
        switchMap(gzippedContents =>
            api.recipe.save$({
                id: recipe.id,
                projectId: recipe.projectId,
                type: recipe.type,
                name: recipe.title || recipe.placeholder,
                gzippedContents,
                expectedRevision
            })
        )
    )
)

const publishSaveState = (recipeId, saveState) => {
    const action = actionBuilder('SET_SAVE_STATE', {recipeId})
    ;(saveState ? action.set(saveStatePath(recipeId), publishedSaveState(saveState)) : action.del(saveStatePath(recipeId))).dispatch()
}

// The store copies whatever it is given, and copying the acknowledged model costs more than the save it reports. Its
// change identifier proves the same thing; only a model the store never identified is published, to be compared by
// content (draftAgreement.js).
const publishedSaveState = ({model, ...saveState}) => {
    const modelHash = getHash(model)
    return modelHash ? {...saveState, modelHash} : {...saveState, model}
}

// A closed recipe's save state lasts as long as the session holds the recipe. Its cache entry is released only once
// nothing claims it and its saves have settled (recipeCacheClaims.js); its revision stays listed, and reopening starts
// from the load that opens it.
const forgetReleasedSaveStates = loadedRecipes => {
    const saves = select('process.saveStates') || {}
    Object.keys(saves)
        .filter(id => !loadedRecipes[id] && saves[id]?.status === SAVED)
        .forEach(id => forgetRecipeSaveState(id))
}

// Catalogue revisions are freshness evidence; save preconditions come from the coordinator's draft base. They only
// advance: a revision this session was told of is never replaced by an older one learned earlier.
const setCatalogueRevision = (recipeId, revision) => {
    const listed = select(['process.recipes', {id: recipeId}, 'revision'])
    if (Number.isInteger(listed) && listed >= revision) {
        return
    }
    actionBuilder('SET_RECIPE_REVISION', {recipeId})
        .set(['process.recipes', {id: recipeId}, 'revision'], revision)
        .dispatch()
}

// An acknowledged revision is what the server now holds. The open draft carries it only while the draft is the
// content acknowledged: a newer edit may already be queued, and its revision is not this one. Autosave compares only
// model, layers and retile, so writing it to the draft cannot provoke another save.
const adoptRevision = (recipeId, revision, model) => {
    setCatalogueRevision(recipeId, revision)
    if (select(recipePath(recipeId, 'model')) === model) {
        actionBuilder('SET_DRAFT_REVISION', {recipeId})
            .set(recipePath(recipeId, 'revision'), revision)
            .dispatch()
    }
}

// The records the autosave last compared. Saving publishes state synchronously and re-enters the listener, so they are
// replaced before anything is saved or acknowledged, and a nested notification finds nothing changed.
let comparedRecipes = null

// A copy is a recipe the server has never seen, so it must not inherit the source's revision.
const recipeCopy = sourceRecipe => ({
    ..._.omit(sourceRecipe, ['revision']),
    id: uuid(),
    placeholder: `${sourceRecipe.title || sourceRecipe.placeholder}_copy`,
    title: null,
    ui: {...sourceRecipe.ui, unsaved: true, initialized: true}
})

const persistentProps = recipe =>
    _.pick(recipe, ['model', 'layers', 'retile'])

const isToBeSaved = (prevRecipe, recipe) =>
    persistentProps(prevRecipe)
        && !_.isEqual(persistentProps(prevRecipe), persistentProps(recipe))
        && select(['process.tabs', {id: recipe.id}])

// Whenever already saved recipes change, save them again. Only a record that is not the one compared before can need
// saving: a listing or tab change alone changes no record, so it is judged with a record's next change, against the
// listing and tabs as they are then.
subscribe('process.loadedRecipes', loadedRecipes => {
    if (!loadedRecipes || loadedRecipes === comparedRecipes) {
        return
    }
    const previousRecipes = comparedRecipes || {}
    comparedRecipes = loadedRecipes
    const changed = Object.keys(loadedRecipes).filter(id => loadedRecipes[id] !== previousRecipes[id])
    if (changed.length) {
        autosave(changed.map(id => loadedRecipes[id]), previousRecipes)
    }
    forgetReleasedSaveStates(loadedRecipes)
})

const autosave = (recipes, previousRecipes) => {
    const listed = new Set((select('process.recipes') || []).map(({id}) => id))
    const savedLoaded = recipes.filter(({id}) => listed.has(id))
    savedLoaded
        .filter(recipe => isToBeSaved(previousRecipes[recipe.id] || {}, recipe))
        .forEach(recipe => save$.next(recipe))
    // A new model object holding what the previous one held changes nothing persisted.
    savedLoaded.forEach(recipe => {
        const previous = previousRecipes[recipe.id]?.model
        if (previous && previous !== recipe.model && _.isEqual(previous, recipe.model)) {
            saveCoordinator.equivalent(recipe.id, previous, recipe.model)
        }
    })
}

export const recipe = RecipeState =>
    WrappedComponent => {
        class RecipeComponent extends React.Component {
            state = {}

            render() {
                const {recipeState} = this.state
                return recipeState
                    ? React.createElement(WrappedComponent, {
                        ...this.props,
                        recipeState
                    })
                    : null
            }

            componentDidMount() {
                this.setState({
                    recipeState: RecipeState(this.props.recipeId)
                })
            }
        }

        const mapStateToProps = (state, ownProps) => ({
            recipePath: recipePath(ownProps.recipeId)
        })
        return compose(
            RecipeComponent,
            connect(mapStateToProps)
        )
    }

export const withRecipePath = () =>
    WrappedComponent => {
        class RecipeComponent extends React.Component {
            render() {
                return React.createElement(WrappedComponent, {...this.props})
            }
        }

        const mapStateToProps = (state, ownProps) => ({
            recipePath: recipePath(ownProps.recipeId)
        })
        return connect(mapStateToProps)(RecipeComponent)
    }

export const initValues = ({getModel, getValues, modelToValues, onInitialized}) =>
    WrappedComponent =>
        class RecipeComponent extends React.Component {
            state = {
                initialized: false
            }

            static getDerivedStateFromProps(props, state) {
                const model = getModel(props)
                const values = getValues(props)
                return {...state, model, values}
            }

            render() {
                const {model, values} = this.state
                return this.state.initialized || !model
                    ? React.createElement(WrappedComponent, {
                        ...this.props,
                        model,
                        values
                    })
                    : null
            }

            componentDidMount() {
                const {model, values} = this.state
                if (model)
                    this.convertModelToValues(model, values)
                this.setState({initialized: true})
            }

            convertModelToValues(model) {
                const valuesFromModel = modelToValues(model)
                onInitialized({
                    model,
                    values: valuesFromModel,
                    props: this.props
                })
            }
        }
