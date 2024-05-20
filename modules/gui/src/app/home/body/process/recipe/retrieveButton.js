import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {usageHint} from '~/app/home/user/usage'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {msg} from '~/translate'
import {ActivationButton} from '~/widget/toolbar/activationButton'

import {withRecipe} from '../recipeContext'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    budgetExceeded: select('user.budgetExceeded')
})

class _RetrieveButton extends React.Component {
    constructor() {
        super()
        this.hint = this.hint.bind(this)
    }

    render() {
        const {initialized, disabled} = this.props
        return (
            <ActivationButton
                id='retrieve'
                icon='cloud-download-alt'
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
        // return (tooltip || msg('process.retrieve.tooltip')) +
        //     (this.isBudgetExceeded() ? ` - ${msg('user.quotaUpdate.info')}` : '')
    }

    hint(enabled) {
        if (this.isBudgetExceeded()) {
            usageHint(enabled)
        }
    }
}

export const RetrieveButton = compose(
    _RetrieveButton,
    withRecipe(mapRecipeToProps)
)

RetrieveButton.propTypes = {
    disabled: PropTypes.any,
    tooltip: PropTypes.any
}
