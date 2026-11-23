import {Mutator} from '~/stateUtils'

// What submitting a recipe form panel's values commits, in one action (recipeFormPanel.jsx): the panel's `model` at its
// `path` in the recipe's model, then the rest of the recipe those values imply (`updates`, the panel's additionalUpdates:
// [{path, value, merge}] over recipe-relative paths). The panel's candidates judge the recipe as the same submission
// leaves it, so what Apply is refused or allowed for is what it would save.

// The recipe as a submission's `updates` leave it, outside the store, applied as the commit applies them: in order, each
// set, or merged into what is there.
export const withUpdates = (recipe, updates) => updates.reduce(
    (recipe, {path, value, merge}) => merge
        ? new Mutator(recipe, path).assign(value)
        : new Mutator(recipe, path).set(value),
    recipe
)

// The recipe as the whole submission leaves it.
export const submittedRecipe = (recipe, {path, model, updates}) =>
    withUpdates(new Mutator(recipe, ['model', path]).set(model), updates)
