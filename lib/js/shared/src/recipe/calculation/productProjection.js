import {recipeType} from '../recipeTypeRegistry.js'

// What a recipe's configuration means for the product another recipe reads of it: its owner's projection
// (`dependencyProjection(model)` on its type), never a consumer's list of its fields. A type declaring none is
// projected whole - its persisted model, without the record's title, UI, layers or placement - which may report a
// change that does not affect its product, and never misses one that does.
export const productProjection = record => {
    const project = recipeType(record?.type)?.dependencyProjection
    return project ? project(record.model) : record?.model ?? null
}
