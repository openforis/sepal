import {defineRecipeType} from '../../recipe/defineRecipeType.js'
import {fromAoi} from '../../recipe/source/aoi.js'

// Every recipe type the registry holds either declares an image output or has none, so a test of what the read,
// Retrieve or an export does with a type that declares none - compatibility kept until declarations are mandatory -
// adds this one to the real registry for its own run. It depends on its AOI, as a recipe type does.
export const UNDECLARED_TYPE = 'UNDECLARED_FIXTURE'

const undeclared = defineRecipeType({type: UNDECLARED_TYPE, directSources: model => fromAoi({model, keys: ['aoi']})})

// The registry module's exports, with the undeclared type added.
export const withUndeclaredType = registry => ({
    ...registry,
    recipeType: type => type === UNDECLARED_TYPE ? undeclared : registry.recipeType(type),
    isSupportedRecipeType: type => type === UNDECLARED_TYPE || registry.isSupportedRecipeType(type)
})
