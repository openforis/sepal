import {ActivationButton} from './activationButton'
import {Context} from './context'
import {PanelButton} from './panelButton'
import {ToolbarButton} from './toolbarButton'
import PropTypes from 'prop-types'
import React from 'react'
import lookStyles from 'style/look.module.css'
import styles from './toolbar.module.css'

export class Toolbar extends React.Component {
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

Toolbar.ActivationButton = ActivationButton
Toolbar.PanelButton = PanelButton
Toolbar.ToolbarButton = ToolbarButton
