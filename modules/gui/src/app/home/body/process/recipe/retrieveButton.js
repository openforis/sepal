import {ActivationButton} from 'widget/toolbar/activationButton'
import {compose} from 'compose'
import {msg} from 'translate'
import {select} from 'store'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    budgetExceeded: select('user.budgetExceeded')
})

class _RetrieveButton extends React.Component {
    render() {
        const {initialized, budgetExceeded, disabled, tooltip} = this.props
        return (
            <ActivationButton
                id='retrieve'
                icon='cloud-download-alt'
                tooltip={tooltip || msg('process.retrieve.tooltip')}
                disabled={!initialized || budgetExceeded || disabled}/>
        )
    }
}

export const RetrieveButton = compose(
    _RetrieveButton,
    withRecipe(mapRecipeToProps)
)

RetrieveButton.propTypes = {
    disabled: PropTypes.any,
    tooltip: PropTypes.string
}
