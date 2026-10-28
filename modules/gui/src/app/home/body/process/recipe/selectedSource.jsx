import _ from 'lodash'
import React from 'react'

import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {composeHoC} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'

import {OutputWatch} from './outputWatch'
import {IMAGE_OUTPUT} from './recipeOutput'
import {itemStatusesOfState, sectionProblemsOfState} from './selectedSourceStatus'
import {isJudgedByOutput, readOutputRequirementsOfState} from './sourceRequirements'

// `sourceProblems`: {[sectionId]: message} for the sections whose selected source is unavailable or unsuitable, or whose
// own configuration does not meet its requirements, for a toolbar to mark them; `wizardStepProblems` the same, for the
// section a wizard has open as its step. Needs the recipe's id, as a recipe-connected component has it.
export const withSourceProblems = () => composeHoC(
    connect((state, {recipeId, sourceRuntime}) => sectionProblemsOfState(
        state, recipeId, id => sourceRuntime?.evidenceOwnerOf(id), Date.now(), key => sourceRuntime?.heldFor(key)
    )),
    withOutputRequirementWatch(),
    withSourceRuntime()
)

// `itemProblems`: {[itemId]: message} for a section's items, including references to recipes with confirmed upstream
// problems. The requirements bridge locates each mark. Needs the recipe's id.
export const withItemProblems = sectionId => composeHoC(
    connect((state, {recipeId, sourceRuntime}) => ({
        itemProblems: _.mapValues(
            itemStatusesOfState(state, recipeId, sectionId, key => sourceRuntime?.heldFor(key)),
            ({message}) => message
        )
    })),
    withOutputRequirementWatch(),
    withSourceRuntime()
)

// What `propsOf(reads)` makes of the reads of the requirements the recipe's output read judges (sourceRequirements.js),
// for a panel whose settings depend on what they establish. Needs the recipe's id.
export const withOutputRequirementReads = propsOf => composeHoC(
    connect((state, {recipeId, sourceRuntime}) => {
        const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
        return propsOf(recipe ? readOutputRequirementsOfState({state, recipe, heldFor: key => sourceRuntime?.heldFor(key)}) : [])
    }),
    withOutputRequirementWatch(),
    withSourceRuntime()
)

// Watches the recipe's image output while mounted, where its type declares requirements that output judges
// (sourceRequirements.js): what they find is acquired wherever it is shown, not only once a layer, Retrieve or an editor
// asks. It asks to explain a refusal, as those requirements read it, so what a refusal leaves unread is read too; a
// description it needs is shared with a layer's and Retrieve's question. Answers reach the session as they settle.
const withOutputRequirementWatch = () => WrappedComponent => {
    class OutputRequirementWatch extends React.Component {
        watch = this.props.sourceRuntime
            ? new OutputWatch({sourceRuntime: this.props.sourceRuntime, onChange: () => {}})
            : null

        render() {
            return <WrappedComponent {...this.props}/>
        }

        componentDidMount() {
            this.update()
        }

        componentDidUpdate() {
            this.update()
        }

        componentWillUnmount() {
            this.watch?.stop()
        }

        update() {
            const {recipeId} = this.props
            this.watch?.update(isJudgedByOutput(select(['process.loadedRecipes', recipeId, 'type']))
                ? {recipeId, product: {name: IMAGE_OUTPUT}, explain: true}
                : null)
        }
    }
    return OutputRequirementWatch
}
