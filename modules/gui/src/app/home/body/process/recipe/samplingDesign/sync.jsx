import _ from 'lodash'
import React from 'react'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'

import {planModelUpdates} from './sampling/planDerivedUpdates'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    model: selectFrom(recipe, 'model')
})

// Keeps the derived sections consistent with the model they belong to. A panel is mounted only while it is
// open, so anything that has to stay correct with a panel closed has to happen here. What to write is decided
// entirely by the pure planner; this only dispatches it, in one action, so no intermediate model exists in
// which one section has been updated and another has not.
class _Sync extends React.Component {
    constructor(props) {
        super(props)
        this.actionBuilder = recipeActionBuilder(props.recipeId)
    }

    render() {
        return null
    }

    componentDidUpdate(prevProps) {
        const updates = planModelUpdates(prevProps.model, this.props.model)
        if (updates.length) {
            updates.reduce(
                (builder, [path, value]) => builder.set(['model', ...path], value),
                this.actionBuilder('UPDATE_DERIVED_SECTIONS')
            ).dispatch()
        }
    }
}

export const Sync = compose(
    _Sync,
    withRecipe(mapRecipeToProps)
)
