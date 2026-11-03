import _ from 'lodash'

import {SUPPORTED} from '#sepal/recipe/requirement/verdict'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {Mutator, selectFrom, toPathList} from '~/stateUtils'
import {dispatch, select} from '~/store'

// A result a form panel derives synchronously from the recipe as its values would leave it, declared by the recipe's type
// (`derivedResults`):
//
//   {id, panel, candidate?(recipe, model), current(model), derive(model)}
//
// `panel` is the form panel editing it, `candidate` the recipe's model as the panel's values would leave it - by default
// the recipe's model with the panel's section replaced - `current` whether that model holds the result derived from it,
// and `derive` the values deriving it gives the panel's draft. While the panel is open, whenever the edit - or the recipe
// it is edited over - leaves the draft not current, the binding derives it again into the draft: Apply takes it with the
// rest of the edit, and Cancel leaves the recipe as it was. A
// result a person has to approve keeps, in what `derive` gives, a record of what it was derived from, which `current`
// compares with what the model reads now: the record is captured as the result is derived, never as it is applied.
//
// Nothing is acquired, polled or cached: a derivation reads the model alone. A submission whose values are not current -
// the recipe changed under the panel, or the edit landed after the last render - is refused, and the draft derived again
// for the panel to show (recipeFormPanel.jsx).
export class DerivedResult {
    #recipeId
    #declaration
    #valuesToModel
    #setValues
    #derivedFor = null

    // `setValues` gives the draft the values of a derivation, {[field]: value}.
    constructor({recipeId, declaration, valuesToModel, setValues}) {
        this.#recipeId = recipeId
        this.#declaration = {candidate: (recipe, model) => ({...recipe.model, [declaration.panel]: model}), ...declaration}
        this.#valuesToModel = valuesToModel
        this.#setValues = setValues
    }

    update(values) {
        const model = this.#candidate(values)
        if (model && !this.#declaration.current(model)) {
            this.#derive(model)
        }
    }

    // Whether submitted values hold the result derived from the recipe as it stands now: if not, the draft is derived again
    // for them, and they are refused.
    accepts(values) {
        const model = this.#candidate(values)
        if (!model || this.#declaration.current(model)) {
            return true
        }
        this.#derivedFor = null
        this.#derive(model)
        return false
    }

    // Once for each model: what a derivation gives lands in the draft over the next render, which asks again.
    #derive(model) {
        if (!_.isEqual(model, this.#derivedFor)) {
            this.#derivedFor = model
            this.#setValues(this.#declaration.derive(model))
        }
    }

    #candidate(values) {
        const recipe = select(['process.loadedRecipes', this.#recipeId])
        return recipe ? this.#declaration.candidate(recipe, this.#valuesToModel(values)) : null
    }
}

// A result a type keeps derived in the applied recipe rather than in a draft - `applied` in place of `panel` - whichever
// editor commits a change, or none:
//
//   {id, applied: {items, read(model, index), requirement, inputs(read, item), follow(item, {previous, model}),
//                  derive(item, read), followRecipe(previous, recipe)}}
//
// `items` is the model path of an ordered list whose items read only those before them. Each commit derives them in its
// own action (commitRecipe), over the recipe as the action leaves it and the recipe before. In order, over the model as
// derived so far, an item follows what the commit renamed that it reads (`follow`), is read as its requirement reads it
// (`read`: {id, facts, prerequisites}), and is derived (`derive`) only where its `requirement` is met, every prerequisite
// item was met before it in the same pass, and its `inputs` differ from those it had before the commit. Any other item is
// kept: one that cannot be derived keeps what it was last derived as until it is repaired, and an edit to nothing it reads
// derives nothing. `followRecipe` gives what else a change changes, as [{path, value}] over recipe-relative paths: for the
// commit's own change first, then for each item derived, in order, each over the recipe as the step before left it - so
// what one step gives, such as a name, is given against what the items after it still hold. Opening a recipe or
// returning to its tab commits nothing, and drafts are never read.

// A change to a recipe's applied model, committed as one action: `builder`'s, with what keeps the applied derivations of
// the recipe's type current, derived from the recipe as that action leaves it.
export const commitRecipe = (recipePath, builder) => {
    const action = builder.build()
    dispatch({...action, reduce: state => withAppliedDerivations(state, action.reduce(state), recipePath)})
}

const withAppliedDerivations = (previousState, state, recipePath) => {
    const previous = selectFrom(previousState, recipePath)
    const recipe = selectFrom(state, recipePath)
    if (!previous?.model || !recipe?.model || previous.model === recipe.model) {
        return state
    }
    return (getRecipeType(recipe.type)?.derivedResults || [])
        .filter(({applied}) => applied)
        .reduce(
            (state, {applied}) => derivedUpdates(applied, previous, selectFrom(state, recipePath))
                .reduce((state, {path, value}) => new Mutator(state, [recipePath, path]).set(value), state),
            state
        )
}

const derivedUpdates = (declaration, previous, recipe) => {
    const itemsPath = toPathList(declaration.items)
    const derived = derivedItems(declaration, previous, recipe, itemsPath)
    const followed = followedRecipe(declaration, previous, recipe, itemsPath, derived)
    return _.uniqWith([['model', ...itemsPath], ...followed.paths], _.isEqual)
        .map(path => ({path, value: selectFrom(followed.recipe, path)}))
        .filter(({path, value}) => !_.isEqual(value, selectFrom(recipe, path)))
}

const derivedItems = ({read, requirement, inputs, follow, derive}, previous, recipe, itemsPath) => {
    const items = selectFrom(recipe.model, itemsPath) || []
    const before = (selectFrom(previous.model, itemsPath) || []).map((item, index) => ({item, read: read(previous.model, index)}))
    const modelWith = (derived, item, index) => withValue(recipe.model, itemsPath, [...derived, item, ...items.slice(index + 1)])
    const {derived} = items.reduce(
        ({derived, met}, item, index) => {
            const followed = follow(item, {previous: previous.model, model: modelWith(derived, item, index)})
            const itemRead = read(modelWith(derived, followed, index), index)
            const was = before.find(({read}) => read.id === itemRead.id)
            const isMet = requirement.evaluate(itemRead.facts).status === SUPPORTED
                && itemRead.prerequisites.every(({item}) => met.includes(item))
            const changed = !was || !_.isEqual(inputs(itemRead, followed), inputs(was.read, was.item))
            return {
                derived: [...derived, isMet && changed ? derive(followed, itemRead) : followed],
                met: isMet ? [...met, itemRead.id] : met
            }
        },
        {derived: [], met: []}
    )
    return derived
}

// The recipe as the commit's own change and then each item derived leave it, step by step, and the paths followed.
const followedRecipe = ({followRecipe}, previous, recipe, itemsPath, derived) => {
    const items = selectFrom(recipe.model, itemsPath) || []
    const follow = ({recipe: before, paths}, after) => {
        const updates = followRecipe(before, after)
        return {
            recipe: updates.reduce((recipe, {path, value}) => new Mutator(recipe, path).set(value), after),
            paths: [...paths, ...updates.map(({path}) => toPathList(path))]
        }
    }
    return derived.reduce(
        (followed, item, index) => _.isEqual(item, items[index])
            ? followed
            : follow(followed, withItem(followed.recipe, itemsPath, index, item)),
        follow({recipe: previous, paths: []}, recipe)
    )
}

const withItem = (recipe, itemsPath, index, item) => ({
    ...recipe,
    model: withValue(recipe.model, itemsPath, selectFrom(recipe.model, itemsPath).map((current, i) => i === index ? item : current))
})

// `object` with `value` at `path`, sharing everything else.
const withValue = (object, [key, ...rest], value) =>
    ({...object, [key]: rest.length ? withValue(object?.[key], rest, value) : value})
