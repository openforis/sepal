import PropTypes from 'prop-types'
import React from 'react'
import styles from './toolbar.module.css'
import Tooltip from 'widget/tooltip'
import Icon from 'widget/icon'
import {Msg} from 'translate'
import buttonColors from 'style/button-colors.module.css'

const Context = React.createContext()

export class Toolbar extends React.Component {
    render() {
        const {className, horizontal, vertical, panel, top, bottom, left, right} = this.props
        const classNames = [
            styles.toolbar, 
            buttonColors.buttons,
            horizontal && styles.horizontal,
            vertical && styles.vertical,
            panel && styles.panel,
            top && styles.top,
            bottom && styles.bottom,
            left && styles.left,
            right && styles.right
        ]
        return (
            <div className={className}>
                <div className={classNames.join(' ')}> 
                    <Context.Provider value={{
                        horizontal: !!horizontal,
                        panel: !!panel
                    }}>
                        {this.props.children}
                    </Context.Provider>
                </div>
            </div>
        )
    }
}

Toolbar.propTypes = {
    className: PropTypes.string,
    horizontal: PropTypes.any,
    vertical: PropTypes.any,
    panel: PropTypes.any,
    top: PropTypes.any,
    bottom: PropTypes.any,
    left: PropTypes.any,
    right: PropTypes.any,
    children: PropTypes.array
}

export class ToolbarButton extends React.Component {
    render() {
        const renderLabel = (msg) => <Msg id={msg}/>
        const renderIcon = (icon) => <Icon name={icon}/>
        const {disabled, selected, onClick, icon, label, tooltip} = this.props
        return (
            <Context.Consumer>
                {({horizontal, panel}) =>
                    <Tooltip msg={tooltip} top={horizontal} left={!horizontal} disabled={disabled || (panel && selected)}>
                        <button
                            className={selected && !disabled ? styles.selected : null}
                            onClick={onClick} 
                            disabled={disabled}>
                            {icon ? renderIcon(icon) : renderLabel(label)}
                        </button>
                    </Tooltip>
                }
            </Context.Consumer>
        )
    }
}

ToolbarButton.propTypes = {
    disabled: PropTypes.any,
    selected: PropTypes.any,
    onClick: PropTypes.func,
    icon: PropTypes.string,
    label: PropTypes.string,
    tooltip: PropTypes.string
}
