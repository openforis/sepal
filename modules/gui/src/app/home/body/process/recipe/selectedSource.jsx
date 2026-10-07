import _ from 'lodash'

import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {composeHoC} from '~/compose'
import {connect} from '~/connect'

import {itemStatusesOfState, sourceProblemsOfState} from './selectedSourceStatus'

// `sourceProblems`: {[sectionId]: message} for the sections whose selected source is unavailable or unsuitable, or whose
// own configuration does not meet its requirements, for a toolbar to mark them. Needs the recipe's id, as a recipe-connected component has it.
export const withSourceProblems = () => composeHoC(
    connect((state, {recipeId, sourceRuntime}) => ({
        sourceProblems: sourceProblemsOfState(state, recipeId, id => sourceRuntime?.evidenceOwnerOf(id))
    })),
    withSourceRuntime()
)

// `itemProblems`: {[itemId]: message} for the items of a section its own configuration's requirements mark, for a list to
// mark them. Needs the recipe's id.
export const withItemProblems = sectionId => connect((state, {recipeId}) => ({
    itemProblems: _.mapValues(itemStatusesOfState(state, recipeId, sectionId), ({message}) => message)
}))
