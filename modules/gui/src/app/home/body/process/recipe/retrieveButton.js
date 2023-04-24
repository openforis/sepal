import {ActivationButton} from 'widget/toolbar/activationButton'
import {compose} from 'compose'
import {msg} from 'translate'
import {select} from 'store'
import {selectFrom} from 'stateUtils'
import {usageHint} from 'app/home/user/usage'
import {withRecipe} from '../recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

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
        if (this.isBudgetExceeded()) {
            return msg('process.retrieve.disabled.tooltip')
        } else {
            return tooltip || msg('process.retrieve.tooltip')
        }
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
