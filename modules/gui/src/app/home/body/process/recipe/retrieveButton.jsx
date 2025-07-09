import PropTypes from 'prop-types'
import React from 'react'

import {usageHint} from '~/app/home/user/usage'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {msg} from '~/translate'
import {ToolbarActivationButton} from '~/widget/toolbar/toolbarActivationButton'

import {withRecipe} from '../recipeContext'

const mapRecipeToProps = recipe => ({
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

export const RetrieveButton = compose(
    _RetrieveButton,
    withRecipe(mapRecipeToProps)
)

RetrieveButton.propTypes = {
    disabled: PropTypes.any,
    tooltip: PropTypes.any
}
