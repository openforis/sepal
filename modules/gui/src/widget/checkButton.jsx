import PropTypes from 'prop-types'
import React from 'react'

import {Button} from '~/widget/button'

import styles from './checkButton.module.css'

export class CheckButton extends React.Component {
    constructor() {
        super()
        this.onToggle = this.onToggle.bind(this)
    }

    render() {
        const {chromeless, size, shape, label, tooltip, tooltipPlacement, disabled, checked} = this.props
        return (
            <Button
                chromeless={chromeless && !checked}
                shape={shape}
                size={size}
                icon='check'
                iconClassName={checked ? styles.checked : null}
                iconAttributes={{
                    transform: checked ? 'grow-2' : null
                }}
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
