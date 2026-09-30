import PropTypes from 'prop-types'
import React from 'react'

import {isImageSource} from '~/app/home/body/process/recipeTypeRegistry'
import {RecipeInput} from '~/widget/recipeInput'

export class RecipeSection extends React.Component {
    render() {
        const {input, onLoading} = this.props
        return (
            <RecipeInput
                input={input}
                filter={isImageSource}
                autoFocus
                onLoading={onLoading}
                onBandsLoaded={value => this.onRecipeLoaded(value)}
            />
        )
    }

    onRecipeLoaded({recipe, bandNames}) {
        const {onLoaded} = this.props
        onLoaded({
            id: recipe.id,
            bands: bandNames
        })
    }
}

RecipeSection.propTypes = {
    input: PropTypes.object.isRequired,
}
