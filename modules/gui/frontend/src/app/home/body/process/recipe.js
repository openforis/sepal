import {Subject, of} from 'rxjs'
import {addTab, closeTab} from 'widget/tabs'
import {connect, select, subscribe} from 'store'
import {downloadObjectZip$} from 'widget/download'
import {groupBy, map, mergeMap, switchMap} from 'rxjs/operators'
import {gzip$, ungzip$} from 'gzip'
import {selectFrom, toPathList} from 'collections'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'

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

const saveToBackend$ = new Subject()

saveToBackend$.pipe(
    groupBy(recipe => recipe.id),
    mergeMap(group$ =>
        group$.pipe(
            map(recipe => _.omit(recipe, ['ui'])),
            switchMap(recipe => save$(recipe))
        )
    )
).subscribe(
    recipe => saveRevision(recipe)
)

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

export const saveRecipe = recipe => {
    if (isInitialized(recipe)) {
        updateRecipeList(recipe)
        saveToBackend$.next(recipe)
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

const initializedRecipe = recipe => ({
    ...recipe,
    ui: {initialized: true}
})
    
export const openRecipe$ = recipeId =>
    isRecipeOpen(recipeId)
        ? of(selectRecipe(recipeId))
        : loadRecipe$(recipeId)

const loadRecipe$ = recipeId =>
    api.recipe.load$(recipeId).pipe(
        map(recipe =>
            actionBuilder('OPEN_RECIPE')
                .set(recipePath(select('process.selectedTabId')), initializedRecipe(recipe))
                .set('process.selectedTabId', recipe.id)
                .dispatch()
        )
    )

const selectRecipe = recipeId =>
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
            recipesToSave.forEach(recipe => saveToBackend$.next(recipe))
        }
        prevTabs = recipes
    }
})

const compressRecipe$ = recipe => gzip$(recipe, {to: 'string'})

const uncompressRecipe$ = compressedRecipe => ungzip$(compressedRecipe, {to: 'string'})

const saveRevision = recipe =>
    compressRecipe$(recipe).subscribe(revision =>
        saveRevisionToLocalStorage(recipe.id, revision)
    )

const saveRevisionToLocalStorage = (recipeId, revision) => {
    try {
        localStorage.setItem(`sepal:${recipeId}:${Date.now()}`, revision)
    } catch (exception) {
        if (expireRevisionFromLocalStorage(recipeId))
            saveRevisionToLocalStorage(recipeId, revision)
    }
}

const expireRevisionFromLocalStorage = _recipeId => {
    const keyToExpire = _(localStorage)
        .keys()
        .filter(key => key.startsWith('sepal:'))
        .map(key => ({key, timestamp: key.split(':')[2]}))
        .filter(value => value)
        .sortBy({key: 1})
        .first()
        .key
    localStorage.removeItem(keyToExpire)
    return true
}

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

export const revertToRevision$ = (recipeId, revision) => {
    const compressed = localStorage[`sepal:${recipeId}:${revision}`]
    return uncompressRecipe$(compressed).pipe(
        map(recipe => {
            prevTabs = prevTabs.filter(tab => tab.id !== recipeId)
            closeTab(recipeId, 'process')
            const selectedTabId = select('process.selectedTabId')
            actionBuilder('REVERT_RECIPE')
                .set(recipePath(selectedTabId), initializedRecipe(recipe))
                .set('process.selectedTabId', recipeId)
                .dispatch()
            save$(recipe).subscribe()
            return recipe
        })
    )
}

const save$ = recipe => {
    const name = recipe.title || recipe.placeholder
    return gzip$(_.omit(recipe, ['ui'])).pipe(
        switchMap(gzippedContents =>
            api.recipe.save$({id: recipe.id, type: recipe.type, name, gzippedContents})
        ),
        map(() => recipe)
    )
}

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
