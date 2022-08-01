import {PanelButtons} from './panelButtons'
import {PanelContent} from './panelContent'
import {PanelHeader} from './panelHeader'
import {compose} from 'compose'
import {connect} from 'store'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './panel.module.css'

// PANEL ----------------------------------------------------------------------

class _Panel extends React.Component {
    state = {
        enabled: true
    }

    constructor(props) {
        super(props)
        this.props.onEnable(() => this.setState({enabled: true}))
        this.props.onDisable(() => this.setState({enabled: false}))
    }

    render() {
        const {type} = this.props
        switch (type) {
        case 'normal':
            return this.renderNormal()
        case 'modal':
            return this.renderModal()
        default:
            return this.renderPortal(type)
        }
    }

    renderNormal() {
        return this.renderContent()
    }

    renderModal() {
        return (
            <Portal type='global' center>
                <div
                    className={styles.modalWrapper}
                    onClick={e => e.stopPropagation()}>
                    {this.renderContent()}
                </div>
            </Portal>
        )
    }

    renderPortal(type) {
        return (
            <Portal type='context'>
                {type === 'center'
                    ? this.renderCenteredContent()
                    : this.renderContent()}
            </Portal>
        )
    }

    renderCenteredContent() {
        return (
            <div className={styles.centerWrapper}>
                {this.renderContent()}
            </div>
        )
    }

    renderContent() {
        const {className, type, children} = this.props
        const {enabled} = this.state
        return (
            <div className={[
                styles.panel,
                styles[type],
                enabled ? null : styles.disabled,
                className
            ].join(' ')}>
                {children}
            </div>
        )
    }
}

export const Panel = compose(
    _Panel,
    connect()
)

Panel.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    type: PropTypes.oneOf(['normal', 'modal', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center', 'inline'])
}

Panel.Header = PanelHeader
Panel.Content = PanelContent
Panel.Buttons = PanelButtons
