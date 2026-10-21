import PropTypes from 'prop-types'
import React from 'react'

import {RecipeInput} from '~/widget/recipeInput'

export class RecipeSection extends React.Component {
    render() {
        const {inputs: {name, recipe}, onLoading} = this.props
        return (
            <RecipeInput
                input={recipe}
                filter={type => type.id === 'REGRESSION'}
                autoFocus
                onLoading={onLoading}
                onRecipeLoaded={({recipe}) => name.set(recipe.title || recipe.placeholder)}
            />
        )
    }
}

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired,
}
