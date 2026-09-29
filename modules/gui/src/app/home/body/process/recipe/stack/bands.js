import {stackOutputNames} from '#sepal/recipe/type/stack'

// The legacy answer for a Stack over an input that declares no output, which the declaration cannot describe: the
// names its mapping gives, in the order execution builds them. It goes once every recipe type declares its output.
export const getAvailableBands = recipe =>
    Object.fromEntries(stackOutputNames(recipe.model).map(name => [name, {label: name}]))
