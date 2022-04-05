import {Button} from 'widget/button'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './checkButton.module.css'

export class CheckButton extends React.Component {
    constructor() {
        super()
        this.onToggle = this.onToggle.bind(this)
    }

    render() {
        const {chromeless, size, shape, tooltip, tooltipPlacement, disabled, checked, onToggle} = this.props
        return (
            <Button
                chromeless={chromeless}
                shape={shape}
                size={size}
                icon='check'
                iconClassName={checked ? styles.checked : null}
                iconAttributes={{
                    transform: checked ? 'grow-3' : null
                }}
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
    size: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    onToggle: PropTypes.func
}
