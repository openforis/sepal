import {map, switchMap} from 'rxjs'

import imageFactory from '#sepal/ee/imageFactory'

import {loadRecipe$} from './recipe.js'

const recipeRef = ({id, ...otherRecipeProps}, ...args) => {
    const recipe$ = loadRecipe$(id).pipe(
        map(recipe => {
            return imageFactory({...otherRecipeProps, ...recipe}, ...args)
        })
    )
    return {
        getImage$() {
            return recipe$.pipe(
                switchMap(recipe => recipe.getImage$())
            )
        },
        getBands$() {
            return recipe$.pipe(
                switchMap(recipe => recipe.getBands$())
            )
        },
        getVisParams$() {
            return recipe$.pipe(
                switchMap(recipe => recipe.getVisParams$())
            )
        },
        getGeometry$() {
            return recipe$.pipe(
                switchMap(recipe => recipe.getGeometry$())
            )
        },
        getRecipe$() {
            return recipe$
        }
    }
}

export default recipeRef
