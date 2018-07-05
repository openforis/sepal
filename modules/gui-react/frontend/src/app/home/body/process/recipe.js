import actionBuilder from 'action-builder'
import backend from 'backend'
import _ from 'lodash'
import {map} from 'rxjs/operators'
import {select} from 'store'

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
    const recipeTabIndex = select('process.tabs')
        .findIndex((recipe) => recipe.id === recipeId)
    if (recipeTabIndex === -1)
        return null

    return (path) =>
        select(recipePath(recipeId, path))
}

export const saveRecipe = (recipe) => {
    // TODO: Include ui or not?
    // Takes less space without (e.g. scene area markers/polygons)
    // Requires custom code to re-create ui model once loaded

    // backend.recipe.save$(_.omit(recipe, ['ui'])).pipe(
    backend.recipe.save$(recipe).pipe(
        map(() => {
            const recipes = select('process.recipes').concat({
                id: recipe.id,
                name: recipe.title || recipe.placeholder,
                type: recipe.type
            })
            actionBuilder('SET_RECIPES', {recipes})
                .set('process.recipes', recipes)
                .dispatch()
        })
    ).subscribe()
}

export const exportRecipe = (recipe) => {
    setTimeout(() => {
        const data = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(_.omit(recipe, ['ui']), null, 2))
        var downloadElement = document.createElement('a')
        downloadElement.setAttribute('href', data)
        downloadElement.setAttribute('download', `${recipe.title || recipe.placeholder}.json`)
        document.body.appendChild(downloadElement)
        downloadElement.click()
        downloadElement.remove()
    }, 0)
}

export const loadRecipes$ = () =>
    backend.recipe.loadAll$().pipe(
        map((recipes) => actionBuilder('SET_RECIPES', {recipes})
            .set('process.recipes', recipes)
            .build())
    )

export const deleteRecipe = (recipeId) =>
    backend.recipe.delete$(recipeId).pipe(
        map(() => {
            const recipes = select('process.recipes')
                .filter(recipe => recipe.id !== recipeId)
            actionBuilder('SET_RECIPES', {recipes})
                .set('process.recipes', recipes)
                .dispatch()
        })
    ).subscribe()

export const loadRecipe$ = (recipeId) => {
    const selectedTabId = select('process.selectedTabId')
    return backend.recipe.load$(recipeId).pipe(
        map(recipe =>
            actionBuilder('OPEN_RECIPE')
                .set(recipePath(selectedTabId,), recipe)
                .set('process.selectedTabId', recipe.id)
                .build())
    )
}
