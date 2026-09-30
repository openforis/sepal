import {COUNT} from '#sepal/recipe/type/ccdc'
import {msg} from '~/translate'

// The layer shows how many observations were fitted; the segments CCDC outputs are what the recipes reading it
// describe. Named, so that a layer can never be answered with one while it shows the other.
export const mapProducts = {
    defaults: {visualizationType: 'COUNT'},
    productOf: ({visualizationType}) =>
        visualizationType === 'COUNT' ? {name: COUNT} : null
}

// Which bands a product has is its declaration's to say; this is how the count is shown.
export const bandPresentation = (_recipe, {name} = {}) =>
    name === COUNT
        ? {count: {dataType: {precision: 'int'}, label: msg('process.ccdc.bands.count')}}
        : {}
