import {Button} from 'widget/button'
import {Context} from './context'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './toolbar.module.css'

export class ToolbarButton extends React.Component {
    render() {
        const {className, icon, label, tooltip, disabled, selected, onClick} = this.props
        return (
            <Context.Consumer>
                {({horizontal, panel}) =>
                    <Button
                        className={[selected && !disabled ? styles.selected : null, className].join(' ')}
                        icon={icon}
                        label={label}
                        disabled={disabled}
                        onClick={e => onClick(e)}
                        tooltip={tooltip}
                        tooltipPlacement={horizontal ? 'top' : 'left'}
                        tooltipDisabled={!!(disabled || (panel && selected))}
                    />
                }
            </Context.Consumer>
        )
    }
}

ToolbarButton.propTypes = {
    className: PropTypes.string,
    disabled: PropTypes.any,
    icon: PropTypes.string,
    label: PropTypes.string,
    selected: PropTypes.any,
    tooltip: PropTypes.string,
    onClick: PropTypes.func
}
