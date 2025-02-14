import PropTypes from 'prop-types'
import React from 'react'

import lookStyles from '~/style/look.module.css'
import {Portal} from '~/widget/portal'

import {Context} from './context'
import styles from './toolbar.module.css'
import {ToolbarActivationButton} from './toolbarActivationButton'
import {ToolbarButton} from './toolbarButton'

export class Toolbar extends React.Component {
    panelContainer = React.createRef()

    render() {
        const {horizontal, vertical, placement, className} = this.props
        const classNames = [
            styles.toolbar,
            lookStyles.look,
            horizontal && styles.horizontal,
            vertical && styles.vertical,
            styles[placement],
            className
        ]
        return (
            <Portal type='context'>
                <div className={classNames.join(' ')} ref={this.panelContainer}>
                    <Context.Provider value={{
                        horizontal: !!horizontal,
                        vertical: !!vertical,
                        panelContainer: this.panelContainer.current,
                        placement
                    }}>
                        {this.props.children}
                    </Context.Provider>
                </div>
            </Portal>
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

Toolbar.ActivationButton = ToolbarActivationButton
Toolbar.Button = ToolbarButton
