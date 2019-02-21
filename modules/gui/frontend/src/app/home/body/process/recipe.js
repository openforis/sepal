import {Subject, from, of} from 'rxjs'
import {addTab, closeTab} from 'widget/tabs'
import {connect, select, subscribe} from 'store'
import {downloadObject} from 'widget/download'
import {gzip$, ungzip$} from 'gzip'
import {map, switchMap} from 'rxjs/operators'
import {msg} from 'translate'
import {selectFrom} from 'collections'
import JSZip from 'jszip'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'

export const recipePath = (recipeId, path) => {
    const recipeTabIndex = select('process.tabs')
        .findIndex(recipe => recipe.id === recipeId)
    if (recipeTabIndex === -1)
        throw new Error(`Recipe not found: ${recipeId}`)
    if (path && Array.isArray(path))
        path = path.join('.')
    return ['process.tabs', recipeTabIndex, path]
        .filter(e => e !== undefined)
        .join('.')
}

export const RecipeState = recipeId => {
    if (!isRecipeOpen(recipeId))
        return null

    return path =>
        select(recipePath(recipeId, path))
}

export const setInitialized = (recipeId) => {
    console.log('setInitialized')
    actionBuilder('SET_RECIPE_INITIALIZED', recipeId)
        .set(recipePath(recipeId, 'ui.initialized'), true)
        .dispatch()
    const recipe = select(recipePath(recipeId))
    if (recipe.title)
        saveRecipe(recipe)
}

export const saveRecipe = recipe => {
    if (!selectFrom(recipe, 'ui.initialized')) {
        console.log('saveRecipe not initialized')
        return
    }
    console.log('saveRecipe')
    const listItem = {
        id: recipe.id,
        name: recipe.title || recipe.placeholder,
        type: recipe.type
    }
    let recipes = [...select('process.recipes')]
    const index = recipes.findIndex(savedRecipe => savedRecipe.id === recipe.id)
    if (index > -1)
        recipes[index] = listItem
    else {
        recipes.push(listItem)
        recipes = _.sortBy(recipes, 'name')
    }

    actionBuilder('SET_RECIPES', {recipes})
        .set('process.recipes', recipes)
        .dispatch()

    saveToBackend$.next(recipe)
}

export const exportRecipe = recipe => {
    const name = `${recipe.title || recipe.placeholder}`
    const recipeString = JSON.stringify(_.omit(recipe, ['ui']), null, 2)
    from(new JSZip().file(name + '.json', recipeString).generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 5
        }
    })).pipe(
        map(zippedRecipe => downloadObject(zippedRecipe, name + '.zip'))
    ).subscribe()
}

export const loadRecipes$ = () =>
    api.recipe.loadAll$().pipe(
        map(recipes => actionBuilder('SET_RECIPES', {recipes})
            .set('process.recipes', recipes)
            .build())
    )

export const loadRecipe$ = recipeId => {
    const selectedTabId = select('process.selectedTabId')
    if (isRecipeOpen(recipeId)) {
        const recipe = select(recipePath(recipeId))
        return of([
            actionBuilder('SELECT_RECIPE')
                .set('process.selectedTabId', recipe.id)
                .build()
        ])
    } else {
        return api.recipe.load$(recipeId).pipe(
            map(recipe =>
                actionBuilder('OPEN_RECIPE')
                    .set(recipePath(selectedTabId), {...recipe, ui: {initialized: true}})
                    .set('process.selectedTabId', recipe.id)
                    .build())
        )
    }
}

export const duplicateRecipe$ = (sourceRecipeId, destinationRecipeId) => {
    return api.recipe.load$(sourceRecipeId).pipe(
        map(recipe => ({
            ...recipe,
            id: destinationRecipeId,
            title: (recipe.title || recipe.placeholder) + '_copy'
        })),
        map(duplicate =>
            actionBuilder('DUPLICATE_RECIPE', {duplicate})
                .set(recipePath(destinationRecipeId), {...duplicate, ui: {initialized: true}})
                .build()
        )
    )
}

export const addRecipe = recipe => {
    const tab = addTab('process')
    recipe.id = tab.id
    return actionBuilder('SELECT_RECIPE')
        .set(recipePath(recipe.id), recipe)
        .set('process.selectedTabId', recipe.id)
        .dispatch()
}

export const removeRecipe$ = recipeId =>
    api.recipe.delete$(recipeId)

export const removeRecipe = recipeId =>
    removeRecipe$(recipeId)
        .subscribe(() => {
            closeTab(recipeId, 'process')
            Notifications.success({message: msg('process.recipe.remove.success')})
            actionBuilder('REMOVE_RECIPE', {recipeId})
                .delValueByTemplate('process.recipes', {id: recipeId})
                .dispatch()
        })

export const isRecipeOpen = recipeId =>
    select('process.tabs').findIndex(recipe => recipe.id === recipeId) > -1

const saveToBackend$ = new Subject()

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

saveToBackend$.pipe(
    switchMap(recipe => {
        gzip$(_.omit(recipe, ['ui']), {to: 'string'}).subscribe(revision =>
            saveRevisionToLocalStorage(recipe.id, revision)
        )
        return save$(recipe)
    })
).subscribe()

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
    return ungzip$(compressed, {to: 'string'}).pipe(
        map(recipe => {
            prevTabs = prevTabs.filter(tab => tab.id !== recipeId)
            closeTab(recipeId, 'process')
            const selectedTabId = select('process.selectedTabId')
            actionBuilder('REVERT_RECIPE')
                .set(recipePath(selectedTabId), recipe)
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
