import {Subject} from 'rxjs'
import {addTab, closeTab} from 'widget/tabs'
import {connect, select, subscribe} from 'store'
import {debounceTime, groupBy, map, mergeMap, switchMap} from 'rxjs/operators'
import {downloadObjectZip$} from 'widget/download'
import {gzip$, ungzip$} from 'gzip'
import {selectFrom, toPathList} from 'collections'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'

const saveToBackend$ = (() => {
    const save$ = new Subject()

    save$.pipe(
        groupBy(recipe => recipe.id),
        mergeMap(group$ =>
            group$.pipe(
                map(recipe => _.omit(recipe, ['ui'])),
                switchMap(recipe => gzip$(recipe).pipe(
                    switchMap(compressedRecipe =>
                        api.recipe.save$({
                            id: recipe.id,
                            type: recipe.type,
                            name: recipe.title || recipe.placeholder,
                            gzippedContents: compressedRecipe
                        })
                    )
                ))
            )
        )
    ).subscribe()

    return save$
})()

const saveRevision = (recipeId, recipe) => localStorage.setItem(`sepal:${recipeId}:${Date.now()}`, recipe)
const loadRevision = (recipeId, revision) => localStorage[`sepal:${recipeId}:${revision}`]

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

const recipeTabIndex = recipeId => {
    const index = select('process.tabs').findIndex(recipe => recipe.id === recipeId)
    if (index === -1) {
        throw new Error(`Recipe not found: ${recipeId}`)
    }
    return index
}

export const recipePath = (recipeId, path) =>
    toPathList(['process.tabs', recipeTabIndex(recipeId), path])

export const RecipeState = recipeId =>
    isRecipeOpen(recipeId)
        ? path => select(recipePath(recipeId, path))
        : null

export const setInitialized = (recipeId) => {
    actionBuilder('SET_RECIPE_INITIALIZED', recipeId)
        .set(recipePath(recipeId, 'ui.initialized'), true)
        .dispatch()
    const recipe = select(recipePath(recipeId))
    if (recipe.title)
        saveRecipe(recipe)
}

const updateRecipeList = recipe =>
    actionBuilder('SET_RECIPES')
        .assignOrAddValueByTemplate('process.recipes', {id: recipe.id}, {
            id: recipe.id,
            name: recipe.title || recipe.placeholder,
            type: recipe.type
        })
        .dispatch()

const isInitialized = recipe =>
    selectFrom(recipe, 'ui.initialized')

const initializedRecipe = recipe => ({
    ...recipe,
    ui: {initialized: true}
})
        
export const saveRecipe = recipe => {
    if (isInitialized(recipe)) {
        updateRecipeList(recipe)
        saveToBackend$.next(recipe)
        saveToLocalStorage$.next(recipe)
    }
}

export const exportRecipe$ = recipe =>
    downloadObjectZip$({
        filename: `${recipe.title || recipe.placeholder}.json`,
        data: JSON.stringify(_.omit(recipe, ['ui']), null, 2)
    })

export const loadRecipes$ = () =>
    api.recipe.loadAll$().pipe(
        map(recipes => actionBuilder('SET_RECIPES', {recipes})
            .set('process.recipes', recipes)
            .dispatch())
    )

export const loadRecipe$ = recipeId =>
    api.recipe.load$(recipeId).pipe(
        map(recipe =>
            actionBuilder('LOAD_RECIPE')
                .set(recipePath(select('process.selectedTabId')), initializedRecipe(recipe))
                .set('process.selectedTabId', recipe.id)
                .dispatch()
        )
    )

export const selectRecipe = recipeId =>
    actionBuilder('SELECT_RECIPE')
        .set('process.selectedTabId', recipeId)
        .dispatch()

export const duplicateRecipe$ = (sourceRecipeId, destinationRecipeId) =>
    api.recipe.load$(sourceRecipeId).pipe(
        map(recipe => ({
            ...recipe,
            id: destinationRecipeId,
            title: (recipe.title || recipe.placeholder) + '_copy'
        })),
        map(duplicate =>
            actionBuilder('DUPLICATE_RECIPE', {duplicate})
                .set(recipePath(destinationRecipeId), initializedRecipe(recipe))
                .dispatch()
        )
    )

export const removeRecipe$ = recipeId =>
    // [TODO] remove from local storage as well?
    api.recipe.delete$(recipeId).pipe(
        map(() =>
            actionBuilder('REMOVE_RECIPE', {recipeId})
                .delValueByTemplate('process.recipes', {id: recipeId})
                .dispatch()
        )
    )

export const addRecipe = recipe => {
    const tab = addTab('process')
    recipe.id = tab.id
    return actionBuilder('SELECT_RECIPE')
        .set(recipePath(recipe.id), recipe)
        .set('process.selectedTabId', recipe.id)
        .dispatch()
}

export const isRecipeOpen = recipeId =>
    select('process.tabs').findIndex(recipe => recipe.id === recipeId) > -1

// [TODO] - to be cleaned up

let prevTabs = []

const findPrevRecipe = recipe =>
    prevTabs.find(prevRecipe => prevRecipe.id === recipe.id) || {}

subscribe('process.tabs', recipes => {
    if (recipes && (prevTabs.length === 0 || prevTabs !== recipes)) {
        const recipesToSave = recipes
            .filter(recipe =>
                (select('process.recipes') || []).find(saved =>
                    saved.id === recipe.id
                )
            )
            .filter(recipe => {
                const prevRecipe = findPrevRecipe(recipe)
                return prevRecipe.model && !_.isEqual(prevRecipe.model, recipe.model)
            })
        if (recipesToSave.length > 0) {
            recipesToSave.forEach(recipe => {
                saveToBackend$.next(recipe)
                saveToLocalStorage$.next(recipe)
            })
        }
        prevTabs = recipes
    }
})

const uncompressRecipe$ = compressedRecipe => ungzip$(compressedRecipe, {to: 'string'})

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

export const revertToRevision$ = (recipeId, revision) =>
    uncompressRecipe$(loadRevision(recipeId, revision)).pipe(
        map(recipe => {
            prevTabs = prevTabs.filter(tab => tab.id !== recipeId)
            closeTab(recipeId, 'process')
            const selectedTabId = select('process.selectedTabId')
            actionBuilder('REVERT_RECIPE')
                .set(recipePath(selectedTabId), initializedRecipe(recipe))
                .set('process.selectedTabId', recipeId)
                .dispatch()
            saveToBackend$.next(recipe)
            return recipe
        })
    )

export const recipe = (RecipeState) => {
    return WrappedComponent => {
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
                this.setState(prevState => ({
                    ...prevState,
                    recipeState: RecipeState(this.props.recipeId)
                }))
            }
        }

        const mapStateToProps = (state, ownProps) => ({
            recipePath: recipePath(ownProps.recipeId)
        })
        return connect(mapStateToProps)(RecipeComponent)
    }
}

export const withRecipePath = () => {
    return WrappedComponent => {
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
}

export const initValues = ({getModel, getValues, modelToValues, onInitialized}) => {
    return WrappedComponent => {
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
                if (model && !values)
                    this.convertModelToValues(model)
                this.setState(prevState => ({...prevState, initialized: true}))
            }

            convertModelToValues(model) {
                const values = modelToValues(model)
                onInitialized({model, values, props: this.props})
            }
        }

        return RecipeComponent
    }
}
