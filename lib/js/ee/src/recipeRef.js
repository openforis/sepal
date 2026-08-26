import {defer, map, switchMap, throwError} from 'rxjs'

import imageFactory from '#sepal/ee/imageFactory'

import {currentPath, CyclicDependencyException, inPath} from './executionPath.js'
import {loadRecipe$} from './recipe.js'

// The one place a persisted recipe is loaded by id, and therefore the only place a cycle can close: reaching
// a recipe again requires following a reference to it, and every reference arrives here.
//
// Ancestry advances here and nowhere else. The check runs inside defer(), so it sees the path of whoever
// SUBSCRIBED rather than whoever built the reference, and it runs before loadRecipe$ is even constructed -
// a recipe on the current path is never requested.
const recipeRef = ({id, ...otherRecipeProps}, ...args) => {
    const recipe$ = defer(() => {
        const path = currentPath()
        if (path.includes(id)) {
            return throwError(() => new CyclicDependencyException([...path, id]))
        }
        return inPath([...path, id],
            loadRecipe$(id).pipe(
                map(recipe => imageFactory({...otherRecipeProps, ...recipe}, ...args))
            )
        )
    })
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
