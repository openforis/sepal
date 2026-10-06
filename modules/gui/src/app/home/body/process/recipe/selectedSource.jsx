import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {composeHoC} from '~/compose'
import {connect} from '~/connect'

import {sourceProblemsOfState} from './selectedSourceStatus'

// `sourceProblems`: {[sectionId]: message} for the sections whose selected source is unavailable or unsuitable, for a
// toolbar to mark them. Needs the recipe's id, as a recipe-connected component has it.
export const withSourceProblems = () => composeHoC(
    connect((state, {recipeId, sourceRuntime}) => ({
        sourceProblems: sourceProblemsOfState(state, recipeId, id => sourceRuntime?.evidenceOwnerOf(id))
    })),
    withSourceRuntime()
)
