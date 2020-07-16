const {map, switchMap} = require('rx/operators')
const http = require('sepal/httpClient')
const imageFactory = require('sepal/ee/imageFactory')
const {context} = require('sepal/context')
const log = require('sepal/log').getLogger('task')


const recipeRef = ({id}) => {
    log.warn('creating recipeRef', id)
    const recipe$ = loadRecipe$(id)
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
        }
    }
}

const loadRecipe$ = id =>
    http.get$(`${context().sepalHost}/api/processing-recipes/${id}`, {
        username: context().sepalUsername,
        password: context().sepalPassword
    }).pipe(
        map(response => JSON.parse(response.body)),
        map(recipe => {
            log.warn('recipe', recipe)
            return imageFactory(recipe);
        })
    )

module.exports = recipeRef
