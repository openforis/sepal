import _ from 'lodash'
import React from 'react'
import {catchError, defer, map, of, throwError} from 'rxjs'

import {actionBuilder, scopedActionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {publishEvent} from '~/eventPublisher'
import {serialize} from '~/serialize'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {uuid} from '~/uuid'
import {downloadObjectZip$} from '~/widget/download'
import {addTab, closeTab} from '~/widget/tabs/tabActions'

import {isDraft} from './recipeSession/draftAgreement'
import {saveStatePath} from './recipeSession/recipeCache'
import {
    failedListing,
    LISTING_STATE_PATH,
    listingRequest,
    mergedListing,
    refreshedListing,
    refreshingListing,
    touchedListing
} from './recipeSession/recipeListing'
import {currentRecipeSession} from './recipeSession/recipeSession'
import {SAVED} from './recipeSession/saveCoordinator'

export {saveStatePath} from './recipeSession/recipeCache'

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
        currentRecipeSession().save(recipe)
    } else {
        // A recipe still in its setup wizard is not saved yet, but its exports are already named after its title.
        actionBuilder('SET_RECIPE_TITLE', recipe.id)
            .set(recipePath(recipe.id, 'title'), recipe.title)
            .dispatch()
    }
}

// The installed store's session (recipeSession.js) opens a recipe at the revision it was loaded at, and forgets one.
export const openRecipeRevision = loaded =>
    currentRecipeSession().openRecipeRevision(loaded)

export const forgetRecipeSaveState = recipeId =>
    currentRecipeSession().forget(recipeId)

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

// A copy is a recipe the server has never seen, so it must not inherit the source's revision.
const recipeCopy = sourceRecipe => ({
    ..._.omit(sourceRecipe, ['revision']),
    id: uuid(),
    placeholder: `${sourceRecipe.title || sourceRecipe.placeholder}_copy`,
    title: null,
    ui: {...sourceRecipe.ui, unsaved: true, initialized: true}
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

// `modelToValues(model, props)` is given the component's props beside the model: what the values default to can depend on
// the rest of the recipe.
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
                const valuesFromModel = modelToValues(model, this.props)
                onInitialized({
                    model,
                    values: valuesFromModel,
                    props: this.props
                })
            }
        }
