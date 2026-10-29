import PropTypes from 'prop-types'
import React from 'react'

import {RecipeInput} from '~/widget/recipeInput'

export class RecipeSection extends React.Component {
    render() {
        const {inputs: {recipe}, onLoading} = this.props
        return (
            <RecipeInput
                input={recipe}
                filter={type => type.id === 'CLASSIFICATION'}
                autoFocus
                onLoading={onLoading}
                onRecipeLoaded={({recipe}) => this.nameAfter(recipe)}
            />
        )
    }

    // A data set is named after the recipe chosen for it; the one it was saved with keeps the name it was saved with, so
    // reading that recipe on opening edits nothing.
    nameAfter(loaded) {
        const {model, inputs: {name}} = this.props
        name.set(loaded.id === model?.recipe && model?.name ? model.name : loaded.title || loaded.placeholder)
    }
}

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    model: PropTypes.object
}
