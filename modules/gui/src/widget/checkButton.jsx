import PropTypes from 'prop-types'
import React from 'react'

import {Button} from '~/widget/button'

export class CheckButton extends React.Component {
    constructor(props) {
        super(props)
        this.onToggle = this.onToggle.bind(this)
    }

    render() {
        const {chromeless, size, shape, label, tooltip, tooltipPlacement, disabled, checked} = this.props
        return (
            <Button
                chromeless={chromeless && !checked}
                look={checked ? 'selected' : 'default'}
                shape={shape}
                size={size}
                icon='check'
                iconSize={checked ? '2xs' : undefined}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
                onClick={this.onToggle}/>
        )
    }
    
    onToggle() {
        const {checked, onToggle} = this.props
        onToggle && onToggle(!checked)
    }
}

CheckButton.propTypes = {
    checked: PropTypes.any,
    chromeless: PropTypes.any,
    disabled: PropTypes.any,
    label: PropTypes.any,
    size: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    onToggle: PropTypes.func
}
