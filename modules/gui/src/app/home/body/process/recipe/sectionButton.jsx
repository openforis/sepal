import PropTypes from 'prop-types'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {withPanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {withSourceProblems} from './selectedSource'

// The toolbar button opening a section of the recipe, marked while that section's requirements hold it back - what its
// sources, its own configuration or its output read establish (sourceRequirements.js) - with why as its tooltip: as a
// warning while only work not done yet does (`incompleteSections`, selectedSourceStatus.js), otherwise as an error. The
// button's id is the section's. While the recipe is being set up, a section the wizard has not reached is not marked
// yet (panelWizard.jsx), and the step it has open is marked only by what its declarations say there
// (`wizardStepProblems`, selectedSource.jsx): only what the toolbar says waits, not what holds the recipe back.
const _SectionButton = ({id, sourceProblems, wizardStepProblems = sourceProblems, incompleteSections = NONE,
    wizardStepIncompleteSections = incompleteSections, tooltip, panelWizard, recipeId: _recipeId, sourceRuntime: _sourceRuntime, ...props}) => {
    const {problem, incomplete} = markOf(id, panelWizard,
        {problems: sourceProblems, incomplete: incompleteSections},
        {problems: wizardStepProblems, incomplete: wizardStepIncompleteSections})
    return (
        <Toolbar.ActivationButton
            {...props}
            id={id}
            error={Boolean(problem) && !incomplete}
            warning={Boolean(problem) && incomplete}
            tooltip={problem || tooltip}
        />
    )
}

const markOf = (id, panelWizard, marks, wizardStepMarks) => {
    if (panelWizard?.wizard && !panelWizard.reached(id)) {
        return NO_MARK
    }
    const {problems, incomplete} = panelWizard?.wizard && panelWizard.step === id ? wizardStepMarks : marks
    return {problem: problems[id], incomplete: Boolean(incomplete[id])}
}

const NONE = Object.freeze({})

const NO_MARK = Object.freeze({problem: null, incomplete: false})

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
