import {createLoadRecipesById$ as createSharedLoadRecipesById$} from '#sepal/recipe/source/recipeClosureLoader'
import api from '~/apiRegistry'

export const createLoadRecipesById$ = ({loadRecipe$ = id => api.recipe.load$(id)} = {}) =>
    createSharedLoadRecipesById$({loadRecipe$})
