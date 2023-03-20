import {Subject, debounceTime, groupBy, map, mergeMap, switchMap} from 'rxjs'
import {addTab, closeTab} from 'widget/tabs/tabs'
import {compose} from 'compose'
import {connect, select, subscribe} from 'store'
import {deserialize, serialize} from 'serialize'
import {downloadObjectZip$} from 'widget/download'
import {gzip$, ungzip$} from 'gzip'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import {selectFrom} from 'stateUtils'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import actionBuilder, {scopedActionBuilder} from 'action-builder'
import api from 'api'
import guid from 'guid'

const saveToBackend$ = (() => {
    const save$ = new Subject()

    save$.pipe(
        groupBy(recipe => recipe.id),
        mergeMap(group$ =>
            group$.pipe(
                map(recipe => {
                    if (recipe.ui.unsaved) {
                        publishEvent('insert_recipe', {recipe_type: recipe.type})
                    }
                    return _.omit(recipe, ['ui'])
                }),
                switchMap(recipe =>
                    gzip$(recipe).pipe(
                        switchMap(compressedRecipe =>
                            api.recipe.save$({
                                id: recipe.id,
                                projectId: recipe.projectId,
                                type: recipe.type,
                                name: recipe.title || recipe.placeholder,
                                gzippedContents: compressedRecipe
                            })
                        )
                    )
                )
            )
        )
    ).subscribe({
        error: error => Notifications.error({timeout: 0, message: msg('process.saveRecipe.error'), error})
    })

    return save$
})()

const revisionId = (recipeId, revision) => `sepal:${recipeId}:${revision}`
const saveRevision = (recipeId, recipe) => localStorage.setItem(revisionId(recipeId, Date.now()), recipe)
const loadRevision = (recipeId, revision) => localStorage.getItem(revisionId(recipeId, revision))
const removeRevision = (recipeId, revision) => localStorage.removeItem(revisionId(recipeId, revision))

const saveToLocalStorage$ = (() => {
    const save$ = new Subject()
    const DEBOUNCE_SECONDS = 10

    save$.pipe(
        groupBy(recipe => recipe.id),
        mergeMap(group$ =>
            group$.pipe(
                debounceTime(DEBOUNCE_SECONDS * 1000),
                map(recipe => _.omit(recipe, ['ui'])),
                switchMap(recipe =>
                    gzip$(recipe, {to: 'string'}).pipe(
                        map(compressedRecipe => ({recipeId: recipe.id, revision: compressedRecipe}))
                    )
                )
            )
        )
    ).subscribe(({recipeId, revision}) => {
        saveRevisionToLocalStorage(recipeId, revision)
    })

    const saveRevisionToLocalStorage = (recipeId, revision) => {
        try {
            saveRevision(recipeId, revision)
        } catch (exception) {
            if (removeRevisionFromLocalStorage(recipeId)) {
                saveRevisionToLocalStorage(recipeId, revision)
            }
        }
    }

    const removeRevisionFromLocalStorage = _recipeId => {
        // [TODO] implement removal strategy
        const key = _(localStorage)
            .keys()
            .filter(key => key.startsWith('sepal:'))
            .map(key => ({key, timestamp: key.split(':')[2]}))
            .filter(value => value)
            .sortBy({key: 1})
            .first()
            .key
        if (key) {
            localStorage.removeItem(key)
        }
        return key
    }

    return save$
})()

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
        .dispatch()

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
        saveToBackend$.next(recipe)
        saveToLocalStorage$.next(recipe)
    }
}

export const closeRecipe = id =>
    closeTab(id, 'process')

export const exportRecipe$ = recipe =>
    downloadObjectZip$({
        filename: `${recipe.title || recipe.placeholder}.json`,
        data: serialize(_.omit(recipe, ['ui']))
    })

export const loadProjects$ = () =>
    api.project.loadAll$().pipe(
        map(projects => actionBuilder('SET_PROJECTS', {projects})
            .set('process.projects', projects)
            .dispatch())
    )

export const loadRecipes$ = () =>
    api.recipe.loadAll$().pipe(
        map(recipes => actionBuilder('SET_RECIPES', {recipes})
            .set('process.recipes', recipes)
            .dispatch())
    )

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
    return addRecipe({
        ...sourceRecipe,
        id: guid(),
        placeholder: `${sourceRecipe.title || sourceRecipe.placeholder}_copy`,
        title: null,
        ui: {...sourceRecipe.ui, unsaved: true, initialized: true}
    })
}

export const duplicateRecipe$ = (sourceRecipeId, destinationRecipeId) =>
    api.recipe.load$(sourceRecipeId).pipe(
        map(sourceRecipe => duplicateRecipe(sourceRecipe, destinationRecipeId))
    )

export const removeRecipes$ = recipeIds =>
    api.recipe.remove$(recipeIds).pipe(
        map(() =>
            _.transform(recipeIds, (actions, recipeId) => {
                removeAllRevisions(recipeId)
                actions
                    .del(['process.recipes', {id: recipeId}])
                    .del(['process.loadedRecipes', recipeId])
            }, actionBuilder('REMOVE_RECIPES', {recipeIds})).dispatch()
        )
    )

export const moveRecipes$ = (recipeIds, projectId) => {
    const loadedRecipes = select('process.loadedRecipes') || []
    return api.recipe.move$(recipeIds, projectId).pipe(
        map(recipes => recipeIds
            .filter(id => loadedRecipes[id])
            .reduce(
                (builder, id) => {
                    return builder.set(['process.loadedRecipes', id, 'projectId'], projectId)
                },
                actionBuilder('MOVE_RECIPES', {recipeIds, projectId})
                    .set('process.recipes', recipes)
            ).dispatch()
        )
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

let prevRecipes = []

const findPrevRecipe = recipe =>
    prevRecipes.find(prevRecipe => prevRecipe.id === recipe.id) || {}

const persistentProps = recipe =>
    _.pick(recipe, ['model', 'layers'])

const isToBeSaved = (prevRecipe, recipe) =>
    persistentProps(prevRecipe)
        && !_.isEqual(persistentProps(prevRecipe), persistentProps(recipe))
        && select(['process.tabs', {id: recipe.id}])

subscribe('process.loadedRecipes', loadedRecipes => {
    const recipes = loadedRecipes && Object.values(loadedRecipes)
    if (recipes && (prevRecipes.length === 0 || prevRecipes !== recipes)) {
        const recipesToSave = recipes
            .filter(recipe =>
                (select('process.recipes') || []).find(saved =>
                    saved.id === recipe.id
                )
            )
            .filter(recipe => isToBeSaved(findPrevRecipe(recipe), recipe))
        if (recipesToSave.length > 0) {
            recipesToSave.forEach(recipe => {
                saveToBackend$.next(recipe)
                saveToLocalStorage$.next(recipe)
            })
        }
        prevRecipes = recipes
    }
})

const uncompressRecipe$ = compressedRecipe => deserialize(ungzip$(compressedRecipe))

export const getRevisions = recipeId =>
    _(localStorage)
        .keys()
        .filter(key => key.startsWith('sepal:'))
        .map(key => (key.split(':')))
        .filter(([_prefix, id, _timestamp]) => recipeId === id)
        .map(([_prefix, _id, timestamp]) => timestamp)
        .sortBy()
        .reverse()
        .value()

const removeAllRevisions = recipeId =>
    getRevisions(recipeId)
        .forEach(revision => removeRevision(recipeId, revision))

export const revertToRevision$ = (recipeId, revision) =>
    uncompressRecipe$(loadRevision(recipeId, revision)).pipe(
        map(recipe => {
            prevRecipes = prevRecipes.filter(tab => tab.id !== recipeId)
            closeTab(recipeId, 'process')
            const selectedTabId = select('process.selectedTabId')
            const initializedRecipe = initializeRecipe(recipe)
            const {id, placeholder, title, type} = initializedRecipe
            actionBuilder('REVERT_RECIPE')
                .set(tabPath(selectedTabId), {id, placeholder, title, type})
                .set(recipePath(selectedTabId), initializedRecipe)
                .set('process.selectedTabId', recipeId)
                .dispatch()
            saveToBackend$.next(recipe)
            return recipe
        })
    )

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

export const initializeRecipe = recipe => ({
    ...recipe,
    ui: {initialized: true}
})
