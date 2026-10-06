import PropTypes from 'prop-types'
import React from 'react'

import {usageHint} from '~/app/home/user/usage'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {msg} from '~/translate'
import {ToolbarActivationButton} from '~/widget/toolbar/toolbarActivationButton'

import {withRecipe} from '../recipeContext'
import {withSourceRuntime} from '../sourceRuntime/sourceRuntimeContext'
import {retrieveAvailability} from './operationAvailability'

const mapRecipeToProps = recipe => ({
    recipe,
    initialized: selectFrom(recipe, 'ui.initialized'),
    budgetExceeded: select('user.budgetExceeded')
})

class _RetrieveButton extends React.Component {
    constructor(props) {
        super(props)
        this.hint = this.hint.bind(this)
    }

    render() {
        const {initialized, disabled} = this.props
        return (
            <ToolbarActivationButton
                id='retrieve'
                icon='cloud-download-alt'
                panel
                disabled={!initialized || disabled || this.isBudgetExceeded()}
                tooltip={this.getTooltip()}
                tooltipOnVisible={this.hint}
                tooltipAllowedWhenDisabled
            />
        )
    }

    isBudgetExceeded() {
        const {initialized, budgetExceeded, disabled} = this.props
        return initialized && budgetExceeded && !disabled
    }

    getTooltip() {
        const {tooltip} = this.props
        return [
            (tooltip || msg('process.retrieve.tooltip')),
            (this.isBudgetExceeded() ? msg('user.quotaUpdate.info') : null)
        ]
    }

    hint(enabled) {
        if (this.isBudgetExceeded()) {
            usageHint(enabled)
        }
    }
}

// Not offered while Retrieve's prerequisites are being checked or are not met (operationAvailability.js).
const mapStateToProps = (state, {recipe, sourceRuntime, disabled}) => ({
    disabled: disabled || !retrieveAvailability({
        state, recipe, evidenceOwnerOf: id => sourceRuntime?.evidenceOwnerOf(id), now: Date.now()
    }).available
})

export const RetrieveButton = compose(
    _RetrieveButton,
    connect(mapStateToProps),
    withSourceRuntime(),
    withRecipe(mapRecipeToProps)
)

RetrieveButton.propTypes = {
    disabled: PropTypes.any,
    tooltip: PropTypes.any
}
