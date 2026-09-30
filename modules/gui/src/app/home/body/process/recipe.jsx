import _ from 'lodash'
import React from 'react'
import {catchError, defer, firstValueFrom, map, switchMap, throwError} from 'rxjs'

import {actionBuilder, scopedActionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {publishEvent} from '~/eventPublisher'
import {gzip$} from '~/gzip'
import {serialize} from '~/serialize'
import {selectFrom} from '~/stateUtils'
import {select, subscribe} from '~/store'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {downloadObjectZip$} from '~/widget/download'
import {Notifications} from '~/widget/notifications'
import {addTab, closeTab} from '~/widget/tabs/tabActions'

import {initializeRecipe, saveStatePath} from './recipeCache'
import {
    failedListing,
    LISTING_STATE_PATH,
    listingRequest,
    mergedListing,
    refreshedListing,
    refreshingListing,
    touchedListing
} from './recipeListing'
import {createSaveCoordinator} from './saveCoordinator'

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
    const recipe = {
        ...select(recipePath(tab.id)),
        title: tab.title
    }
    if (isInitialized(recipe)) {
        actionBuilder('SET_RECIPE_SAVED', recipe.id)
            .del(recipePath(recipe.id, 'ui.unsaved'))
            .set(recipePath(recipe.id, 'title'), recipe.title)
            .dispatch()
        updateRecipeList(recipe)
        save$.next(recipe)
    }
}

// Seed saving and freshness from the same authoritative load, whose model is what is persisted at its revision. The
// model is written on its own path, so the store gives it a change identifier (~/hash) that the published save evidence
// keeps in its copy: the draft then agrees with what was loaded without comparing content (draftAgreement.js).
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

export const openRecipe = recipe => {
    publishEvent('load_recipe', {recipe_type: recipe.type})
    const {id, placeholder, title, type} = recipe
    actionBuilder('OPEN_RECIPE')
        .set(tabPath(select('process.selectedTabId')), {id, placeholder, title, type})
        .set('process.selectedTabId', id)
        .dispatch()
}

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
    ;(saveState ? action.set(saveStatePath(recipeId), saveState) : action.del(saveStatePath(recipeId))).dispatch()
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

let prevRecipes = []

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

// whenever already saved recipes change, save them again
subscribe('process.loadedRecipes', loadedRecipes => {
    const recipes = loadedRecipes && Object.values(loadedRecipes)
    const savedRecipes = select('process.recipes') || []
    // console.log('loaded recipes listener called', loadedRecipes, recipes)
    if (recipes && (prevRecipes.length === 0 || prevRecipes !== recipes)) {
        const previousRecipes = prevRecipes
        const findPrevRecipe = recipe => previousRecipes.find(previous => previous.id === recipe.id) || {}
        // Saving publishes state synchronously and re-enters this listener. Record this snapshot before any
        // save or agreement notification, so that nested dispatch cannot submit the same edit again.
        prevRecipes = recipes
        const savedLoaded = recipes
            .filter(recipe =>
                savedRecipes.find(({id}) => id === recipe.id)
            )
        const recipesToSave = savedLoaded
            .filter(recipe =>
                isToBeSaved(findPrevRecipe(recipe), recipe)
            )
        if (recipesToSave.length > 0) {
            recipesToSave.forEach(recipe => {
                save$.next(recipe)
            })
        }
        // A new model object holding what the previous one held changes nothing persisted.
        savedLoaded.forEach(recipe => {
            const previous = findPrevRecipe(recipe).model
            if (previous && previous !== recipe.model && _.isEqual(previous, recipe.model)) {
                saveCoordinator.equivalent(recipe.id, previous, recipe.model)
            }
        })
    }
})

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
