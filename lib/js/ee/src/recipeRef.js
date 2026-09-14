import {defer, map, switchMap, throwError} from 'rxjs'

import imageFactory from '#sepal/ee/imageFactory'

import {currentPath, CyclicDependencyException, inCurrentPath, inPath} from './executionPath.js'
import {loadRecipe$} from './recipe.js'

// The one place a persisted recipe is loaded by id, and therefore the only place a cycle can close: reaching
// a recipe again requires following a reference to it, and every reference arrives here.
//
// Ancestry advances here and nowhere else. The check runs inside defer(), so it sees the path of whoever
// SUBSCRIBED rather than whoever built the reference, and it runs before loadRecipe$ is even constructed -
// a recipe on the current path is never requested.
const recipeRef = ({id, ...otherRecipeProps}, ...args) => {
    // Everything derived from the load happens under the child's ancestry, the factory's construction
    // included: built under the caller's path instead, a loaded recipe at the top level would seed a fresh
    // path of its own and the parent it was reached from would vanish from it.
    const loaded = derive => defer(() => {
        const path = currentPath()
        if (path.includes(id)) {
            return throwError(() => new CyclicDependencyException([...path, id]))
        }
        const childPath = [...path, id]
        return inPath(childPath, inCurrentPath(loadRecipe$(id)).pipe(map(derive)))
    })
    const recipe$ = loaded(recipe => imageFactory({...otherRecipeProps, ...recipe}, ...args))
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
        },
        // One load, from which the caller derives both what it needed to know about its source and the
        // factory that runs it. CCDC Slice reads the date representation and whether base band names are
        // selectable here, then builds the image from the SAME record - reading facts from one load and
        // executing another would let the two disagree. `buildImage` constructs inside the child's ancestry,
        // so the cycle check is unchanged.
        withRecord$(derive) {
            return loaded(record =>
                derive(record, (...factoryArgs) => imageFactory({...otherRecipeProps, ...record}, ...factoryArgs)))
        }
    }
}

export default recipeRef
