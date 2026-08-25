import PropTypes from 'prop-types'
import React from 'react'

import {recipeAccess} from '~/app/home/body/process/recipeAccess'
import {compose} from '~/compose'
import {RecipeInput} from '~/widget/recipeInput'

class _RecipeSection extends React.Component {
    render() {
        const {inputs: {recipe}} = this.props
        return (
            <RecipeInput
                input={recipe}
                autoFocus
                errorMessage
            />
        )
    }
}

export const RecipeSection = compose(
    _RecipeSection,
    recipeAccess()
)

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
