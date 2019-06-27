import {Context} from './context'
import {PanelButtonContext} from './panelButtonContext'
import {ToolbarButton} from './toolbarButton'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './toolbar.module.css'

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
