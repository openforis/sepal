import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {dataSetTypeOf, initialDataSets, toSources} from '~/sources'

// What a section's draft starts from as its panel opens: the section as the recipe holds it - or, for the Sources of a
// recipe being set up that has not yet committed data sets, what its type proposes for them.
//
// A type proposing data sets declares them (`initialSources`):
//
//   {dataSets, period(model)}
//
// `dataSets` the data sets it prefers, or a function of the recipe giving them, and `period` the years its execution
// reads (the dataSetPeriod of its shared type). They are proposed as far as those years let them contribute
// (initialDataSets, ~/sources.js), over the dates the recipe holds as Sources open, with their collection type. Opening
// commits nothing: Apply or a wizard step leaving Sources commits the draft, and once the recipe holds data sets none are
// proposed again, whatever its dates become. A recipe already set up - loaded, imported or copied - opens as it is held,
// with data sets missing where they are.
export const initialSectionModel = (recipe, section, model) =>
    section === SOURCES && proposesDataSets(recipe, model)
        ? proposedSources(recipe, model)
        : model

const SOURCES = 'sources'

const proposesDataSets = (recipe, sources) =>
    Boolean(getRecipeType(recipe?.type)?.initialSources) && !recipe.ui?.initialized && sources?.dataSets === undefined

const proposedSources = (recipe, sources) => {
    const {dataSets, period} = getRecipeType(recipe.type).initialSources
    const preferred = typeof dataSets === 'function' ? dataSets(recipe) : dataSets
    return {
        ...sources,
        dataSetType: dataSetTypeOf(preferred),
        dataSets: toSources(initialDataSets(preferred, period(recipe.model)))
    }
}
