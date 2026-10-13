import PropTypes from 'prop-types'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {withSourceProblems} from './selectedSource'

// The toolbar button opening a section of the recipe, marked while that section's requirements hold it back - what its
// sources, its own configuration or its output read establish (sourceRequirements.js) - with why as its tooltip. The
// button's id is the section's.
const _SectionButton = ({id, sourceProblems, tooltip, recipeId: _recipeId, sourceRuntime: _sourceRuntime, ...props}) =>
    <Toolbar.ActivationButton
        {...props}
        id={id}
        error={!!sourceProblems[id]}
        tooltip={sourceProblems[id] || tooltip}
    />

export const SectionButton = compose(
    _SectionButton,
    withSourceProblems(),
    withRecipe(recipe => ({recipeId: recipe.id}))
)

SectionButton.propTypes = {
    id: PropTypes.string.isRequired,
    tooltip: PropTypes.any
}
