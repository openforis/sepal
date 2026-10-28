import PropTypes from 'prop-types'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {withPanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {withSourceProblems} from './selectedSource'

// The toolbar button opening a section of the recipe, marked while that section's requirements hold it back - what its
// sources, its own configuration or its output read establish (sourceRequirements.js) - with why as its tooltip. The
// button's id is the section's. While the recipe is being set up, a section the wizard has not reached is not marked
// yet (panelWizard.jsx), and the step it has open is marked only by what its declarations say there
// (`wizardStepProblems`, selectedSource.jsx): only what the toolbar says waits, not what holds the recipe back.
const _SectionButton = ({id, sourceProblems, wizardStepProblems = sourceProblems, tooltip, panelWizard, recipeId: _recipeId, sourceRuntime: _sourceRuntime, ...props}) => {
    const problem = problemOf(id, panelWizard, sourceProblems, wizardStepProblems)
    return (
        <Toolbar.ActivationButton
            {...props}
            id={id}
            error={!!problem}
            tooltip={problem || tooltip}
        />
    )
}

const problemOf = (id, panelWizard, sourceProblems, wizardStepProblems) => {
    if (!panelWizard?.wizard) {
        return sourceProblems[id]
    }
    if (!panelWizard.reached(id)) {
        return null
    }
    return panelWizard.step === id ? wizardStepProblems[id] : sourceProblems[id]
}

export const SectionButton = compose(
    _SectionButton,
    withSourceProblems(),
    withRecipe(recipe => ({recipeId: recipe.id})),
    withPanelWizard()
)

SectionButton.propTypes = {
    id: PropTypes.string.isRequired,
    tooltip: PropTypes.any
}
