import PropTypes from 'prop-types'
import React from 'react'

import {RecipeInput} from '~/widget/recipeInput'

export class RecipeSection extends React.Component {
    render() {
        const {recipeId, inputs: {name, recipe}, onLoading} = this.props
        return (
            <RecipeInput
                input={recipe}
                filter={(type, recipe) => type.id === 'REGRESSION' && recipe.id !== recipeId}
                autoFocus
                onLoading={onLoading}
                onLoaded={({recipe}) => name.set(recipe.title || recipe.placeholder)}
            />
        )
    }

    // TODO: Should do some validation of the bands. Use a separate input for that?
}

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired,
}
