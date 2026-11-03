import PropTypes from 'prop-types'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose, composeHoC} from '~/compose'
import {withPanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {withSourceProblems} from './selectedSource'

// What the toolbar says of a section of the recipe while its requirements hold it back - what its sources, its own
// configuration or its output read establish (sourceRequirements.js): `sectionMark(id)` is {problem, incomplete}, why,
// and whether only work not done yet does (`incompleteSections`, selectedSourceStatus.js). While the recipe is being set
// up, a section the wizard has not reached is not marked yet (panelWizard.jsx), and the step it has open is marked only
// by what its declarations say there (`wizardStepProblems`, selectedSource.jsx): only what the toolbar says waits, not
// what holds the recipe back. Each control acting on a section says what its button does, from the same reads.
export const withSectionMarks = () => composeHoC(
    WrappedComponent => ({sourceProblems, wizardStepProblems = sourceProblems, incompleteSections = NONE,
        wizardStepIncompleteSections = incompleteSections, panelWizard, ...props}) =>
        <WrappedComponent
            {...props}
            sectionMark={id => markOf(id, panelWizard,
                {problems: sourceProblems, incomplete: incompleteSections},
                {problems: wizardStepProblems, incomplete: wizardStepIncompleteSections})}
        />,
    withSourceProblems(),
    withRecipe(recipe => ({recipeId: recipe.id})),
    withPanelWizard()
)

// The toolbar button opening a section, its id the section's, marked as its section is: as a warning while only work not
// done yet holds it back, otherwise as an error, with why as its tooltip.
const _SectionButton = ({id, sectionMark, tooltip, recipeId: _recipeId, sourceRuntime: _sourceRuntime, ...props}) => {
    const {problem, incomplete} = sectionMark(id)
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
    return {problem: problems[id] || null, incomplete: Boolean(incomplete[id])}
}

const NONE = Object.freeze({})

const NO_MARK = Object.freeze({problem: null, incomplete: false})

export const SectionButton = compose(
    _SectionButton,
    withSectionMarks()
)

SectionButton.propTypes = {
    id: PropTypes.string.isRequired,
    tooltip: PropTypes.any
}
