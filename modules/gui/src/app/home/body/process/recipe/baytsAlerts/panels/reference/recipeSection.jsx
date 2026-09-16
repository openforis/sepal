import PropTypes from 'prop-types'

import {mayProvideHistoricalStats} from '#sepal/recipe/capability/baytsHistoricalStats'
import {RecipeInput} from '~/widget/recipeInput'

export const RecipeSection = ({inputs: {recipe}}) =>
    <RecipeInput
        filter={type => mayProvideHistoricalStats(type.id)}
        input={recipe}
        autoFocus
    />

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
