import actionBuilder from 'action-builder'
import backend from 'backend'
import {gzip$, ungzip$} from 'gzip'
import JSZip from 'jszip'
import _ from 'lodash'
import {from, of, Subject} from 'rxjs'
import {map, switchMap} from 'rxjs/operators'
import {select, subscribe} from 'store'
import {addTab, closeTab} from 'widget/tabs'

export const recipePath = (recipeId, path) => {
    const recipeTabIndex = select('process.tabs')
        .findIndex((recipe) => recipe.id === recipeId)
    if (recipeTabIndex === -1)
        throw new Error(`Recipe not found: ${recipeId}`)
    if (path && Array.isArray(path))
        path = path.join('.')
    return ['process.tabs', recipeTabIndex, path]
        .filter(e => e !== undefined)
        .join('.')
}

export const RecipeState = (recipeId) => {
    if (!isRecipeOpen(recipeId))
        return null

    return (path) =>
        select(recipePath(recipeId, path))
}

export const saveRecipe$ = (recipe) => {
    if (!recipe.type)
        return
    const listItem = {
        id: recipe.id,
        name: recipe.title || recipe.placeholder,
        type: recipe.type
    }
    const recipes = [...select('process.recipes')]
    const index = recipes.findIndex(savedRecipe => savedRecipe.id === recipe.id)
    if (index > -1)
        recipes[index] = listItem
    else
        recipes.push(listItem)

    return of(
        actionBuilder('SET_RECIPES', {recipes})
            .set('process.recipes', recipes)
            .sideEffect(() => saveToBackend$.next(recipe))
            .build()
    )
}

export const saveRecipe = (recipe) =>
    saveRecipe$(recipe).subscribe(action => action.dispatch())

export const exportRecipe = (recipe) => {
    const name = `${recipe.title || recipe.placeholder}`
    const recipeString = JSON.stringify(_.omit(recipe, ['ui']), null, 2)
    from(new JSZip().file(name + '.json', recipeString).generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 5
        }
    })).pipe(
        map(zippedRecipe => {
            const data = window.URL.createObjectURL(zippedRecipe)
            var downloadElement = document.createElement('a')
            downloadElement.setAttribute('href', data)
            downloadElement.setAttribute('download', name + '.zip')
            document.body.appendChild(downloadElement)
            downloadElement.click()
            downloadElement.remove()
            window.URL.revokeObjectURL(data)
        })
    ).subscribe()
}

export const loadRecipes$ = () =>
    backend.recipe.loadAll$().pipe(
        map((recipes) => actionBuilder('SET_RECIPES', {recipes})
            .set('process.recipes', recipes)
            .build())
    )

export const loadRecipe$ = (recipeId) => {
    const selectedTabId = select('process.selectedTabId')
    if (isRecipeOpen(recipeId)) {
        const recipe = select(recipePath(recipeId))
        return of([
            actionBuilder('SELECT_RECIPE')
                .set('process.selectedTabId', recipe.id)
                .build()
        ])
    } else {
        return backend.recipe.load$(recipeId).pipe(
            map(recipe =>
                actionBuilder('OPEN_RECIPE')
                    .set(recipePath(selectedTabId), recipe)
                    .set('process.selectedTabId', recipe.id)
                    .build())
        )
    }
}

export const addRecipe = (recipe) => {
    const tab = addTab('process')
    recipe.id = tab.id
    return actionBuilder('SELECT_RECIPE')
        .set(recipePath(recipe.id), recipe)
        .set('process.selectedTabId', recipe.id)
        .dispatch()
}

export const deleteRecipe$ = (recipeId) =>
    backend.recipe.delete$(recipeId).pipe(
        map(() => {
            const recipes = select('process.recipes')
                .filter(recipe => recipe.id !== recipeId)
            return actionBuilder('SET_RECIPES', {recipes})
                .set('process.recipes', recipes)
                .build()
        })
    )

export const deleteRecipe = (recipeId) =>
    deleteRecipe$(recipeId).subscribe(action => action.dispatch())


const isRecipeOpen = (recipeId) =>
    select('process.tabs').findIndex(recipe => recipe.id === recipeId) > -1

const saveToBackend$ = new Subject()

let prevTabs = []
const findPrevRecipe = (recipe) =>
    prevTabs.find(prevRecipe => prevRecipe.id === recipe.id) || {}
subscribe('process.tabs', (recipes) => {
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
    }
)

saveToBackend$.pipe(
    switchMap(recipe => {
        gzip$(_.omit(recipe, ['ui']), {to: 'string'}).subscribe(revision =>
            saveRevisionToLocalStorage(recipe.id, revision)
        )
        return backend.recipe.save$(recipe)
    })
).subscribe()


const saveRevisionToLocalStorage = (recipeId, revision) => {
    try {
        localStorage.setItem(`${recipeId}:${Date.now()}`, revision)
    } catch (exception) {
        if (expireRevisionFromLocalStorage(recipeId))
            saveRevisionToLocalStorage(recipeId, revision)
    }
}

const expireRevisionFromLocalStorage = (recipeId) => {
    const keyToExpire = _(localStorage)
        .keys()
        .map(key => ({key, timestamp: key.split(':')[1]}))
        .sortBy({key: 1})
        .first()
        .key
    localStorage.removeItem(keyToExpire)
    return true
}

export const getRevisions = (recipeId) =>
    _(localStorage)
        .keys()
        .map(key => (key.split(':')))
        .filter(([id, timestamp]) => recipeId === id)
        .map(([id, timestamp]) => timestamp)
        .sortBy()
        .reverse()
        .value()

export const revertToRevision$ = (recipeId, revision) => {
    const compressed = localStorage[`${recipeId}:${revision}`]
    return ungzip$(compressed, {to: 'string'}).pipe(
        map(recipe => {
            prevTabs = prevTabs.filter(tab => tab.id !== recipeId)
            closeTab(recipeId, 'process')
            const selectedTabId = select('process.selectedTabId')
            actionBuilder('REVERT_RECIPE')
                .set(recipePath(selectedTabId), recipe)
                .set('process.selectedTabId', recipeId)
                .dispatch()
            console.log('saving', recipe)
            backend.recipe.save$(recipe).subscribe()
            return recipe
        })
    )
}