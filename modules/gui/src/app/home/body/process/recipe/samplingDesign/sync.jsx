import _ from 'lodash'
import React from 'react'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    stratification: selectFrom(recipe, 'model.stratification'),
    proportions: selectFrom(recipe, 'model.proportions'),
    sampleAllocation: selectFrom(recipe, 'model.sampleAllocation'),
    sampleArrangement: selectFrom(recipe, 'model.sampleArrangement'),
})

// TODO: Deal with validation here? Or where should it be done?

class _Sync extends React.Component {
    constructor(props) {
        super(props)
        this.actionBuilder = recipeActionBuilder(props.recipeId)
    }

    render() {
        return null
    }

    // If AOI updates, STR becomes invalid
    // If STR updates, PRO becomes invalid
    // If PRO updates, SMP becomes invalid
    
    // When a section updates, that sections automatically becomes valid
    // Valid state must be persisted as part of the recipe
    // Maybe call it "requiresUpdate"

    componentDidUpdate(prevProps) {
        const changed = propName =>
            !_.isEqual(
                _.omit(prevProps[propName], 'requiresUpdate'),
                _.omit(this.props[propName], 'requiresUpdate')
            )

        const changedByProp = {
            aoi: changed('aoi'),
            stratification: changed('stratification'),
            proportions: changed('proportions'),
            sampleAllocation: changed('sampleAllocation'),
            sampleArrangement: changed('sampleArrangement'),
        }
        if (Object.values(changedByProp).some(changed => changed)) {
            this.updateRequiresUpdates(changedByProp)
        }
    }

    updateRequiresUpdates(changedByProp) {
        Object.keys(changedByProp)
            .filter(propName => changedByProp[propName])
            .forEach(propName => this.requiresUpdate(propName))
    }

    // A changed section becomes valid itself, and invalidates the section that depends on it.
    requiresUpdate(propName) {
        const dependentPropName = DEPENDENCIES[propName]
        this.actionBuilder('RESET_REQUIRE_UPDATE', {propName})
            .set(['model', propName, 'requiresUpdate'], false)
            .dispatch()
        if (dependentPropName) {
            this.actionBuilder('REQUIRE_UPDATE', {dependentPropName})
                .set(['model', dependentPropName, 'requiresUpdate'], true)
                .dispatch()
        }
    }

}

const DEPENDENCIES = {
    aoi: 'stratification',
    stratification: 'proportions',
    proportions: 'sampleAllocation'
}

export const Sync = compose(
    _Sync,
    withRecipe(mapRecipeToProps)
)
