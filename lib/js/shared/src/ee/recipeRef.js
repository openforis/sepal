const {map, switchMap} = require('rx/operators')
const {loadRecipe$} = require('./recipe')
const imageFactory = require('sepal/ee/imageFactory')

const recipeRef = ({id}, ...args) => {
    const recipe$ = loadRecipe$(id).pipe(
        map(recipe => imageFactory(recipe, ...args))
    )
    return {
        getImage$() {
            return recipe$.pipe(
                switchMap(recipe => recipe.getImage$())
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

module.exports = recipeRef
