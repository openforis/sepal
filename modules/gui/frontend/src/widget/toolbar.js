import {Activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import lookStyles from 'style/look.module.css'
import styles from './toolbar.module.css'

const Context = React.createContext()

export default class Toolbar extends React.Component {
    panelContainer = React.createRef()

    render() {
        const {horizontal, vertical, panel, placement, className} = this.props
        const classNames = [
            styles.toolbar,
            lookStyles.look,
            horizontal && styles.horizontal,
            vertical && styles.vertical,
            panel && styles.panelButton,
            styles[placement],
            className
        ]
        return (
            <div ref={this.panelContainer}>
                <div className={classNames.join(' ')}>
                    <Context.Provider value={{
                        horizontal: !!horizontal,
                        panel: !!panel,
                        panelContainer: this.panelContainer.current,
                        placement
                    }}>
                        {this.props.children}
                    </Context.Provider>
                </div>
            </div>
        )
    }
}

Toolbar.propTypes = {
    bottom: PropTypes.any,
    children: PropTypes.any,
    className: PropTypes.string,
    horizontal: PropTypes.any,
    left: PropTypes.any,
    panel: PropTypes.any,
    right: PropTypes.any,
    top: PropTypes.any,
    vertical: PropTypes.any
}

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

export class PanelButton extends React.Component {
    render() {
        const {name, icon, label, tooltip, disabled, onClick, children} = this.props
        return (
            <Context.Consumer>
                {toolbarProps => {
                    this.toolbarProps = toolbarProps
                    const {panelContainer, placement, modal, selectedPanel} = this.toolbarProps
                    const selected = selectedPanel === name
                    return <React.Fragment>
                        <ToolbarButton
                            disabled={disabled || selected || modal}
                            selected={selected}
                            icon={icon}
                            label={label}
                            tooltip={tooltip}
                            className={[styles.panelButton, selected ? styles.selected : null].join(' ')}
                            onClick={e => {
                                this.select()
                                onClick && onClick(e)
                            }}/>
                        {
                            panelContainer && selected
                                ? (
                                    <Portal container={panelContainer}>
                                        <PanelButtonContext.Provider value={placement}>
                                            {children}
                                        </PanelButtonContext.Provider>
                                    </Portal>
                                ) : null
                        }
                    </React.Fragment>
                }}
            </Context.Consumer>
        )
    }
}

PanelButton.propTypes = {
    children: PropTypes.any.isRequired,
    name: PropTypes.string.isRequired,
    disabled: PropTypes.any,
    icon: PropTypes.string,
    label: PropTypes.string,
    tooltip: PropTypes.string,
    onClick: PropTypes.func
}

export class ActivationButton extends React.Component {
    render() {
        const {id, icon, label, tooltip, disabled, onClick} = this.props
        return (
            <Activator id={id}>
                {({activate, deactivate, active, canActivate}) =>
                    <ToolbarButton
                        disabled={disabled || !canActivate}
                        selected={active}
                        icon={icon}
                        label={label}
                        tooltip={tooltip}
                        className={[styles.panelButton, active ? styles.selected : null].join(' ')}
                        onClick={e => {
                            active ? deactivate() : activate()
                            onClick && onClick(e)
                        }}/>
                }
            </Activator>
        )
    }
}

ActivationButton.propTypes = {
    id: PropTypes.string.isRequired,
    disabled: PropTypes.any,
    icon: PropTypes.string,
    label: PropTypes.string,
    tooltip: PropTypes.string,
    onClick: PropTypes.func
}

export const PanelButtonContext = React.createContext()
