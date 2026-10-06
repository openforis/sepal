import PropTypes from 'prop-types'
import React from 'react'

import {mayProvideSegments} from '#sepal/recipe/capability/ccdcSegments'
import {recipeAccess} from '~/app/home/body/process/recipeAccess'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {RecipeInput} from '~/widget/recipeInput'

// Recipes whose type may provide segments are offered - a Masking over CCDC among them. Whether the one selected does is
// the requirements' to judge, from the evidence the candidate's observation reads (sourceCandidate.js). A saved
// selection stays selected, offered or not.
class _RecipeSection extends React.Component {
    render() {
        const {inputs: {recipe}, labelButtons} = this.props
        return (
            <RecipeInput
                label={msg('process.ccdcSlice.panel.source.form.recipe.label')}
                labelButtons={labelButtons}
                filter={type => mayProvideSegments(type.id)}
                input={recipe}
                autoFocus
                keepSelection
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
    inputs: PropTypes.object.isRequired,
    labelButtons: PropTypes.array
}
