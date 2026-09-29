import {IMAGE_OUTPUT} from '#sepal/recipe/output/product'
import {baytsHistoricalBandNames, baytsHistoricalRefusals} from '#sepal/recipe/type/baytsHistorical'

const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

// The bands its orbits name, or none where the declaration refuses them.
export const declaredBandNames = recipe =>
    baytsHistoricalRefusals(recipe.model).length ? [] : baytsHistoricalBandNames(recipe.model)

// How a band is shown; which bands exist is the declaration's to say. An orbit is a relative orbit number.
const presentation = name =>
    ({dataType: name.startsWith('orbit_') ? typeInt : typeFloat})

export const bandPresentation = (recipe, {name} = {}) =>
    name === IMAGE_OUTPUT
        ? Object.fromEntries(declaredBandNames(recipe).map(band => [band, presentation(band)]))
        : {}
