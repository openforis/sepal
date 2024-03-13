import {PanelButtons} from './panelButtons'
import {PanelContent} from './panelContent'
import {PanelHeader} from './panelHeader'
import {Portal} from '~/widget/portal'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {withEnableDetector} from '~/enabled'
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
        this.onClick = this.onClick.bind(this)
        const {enableDetector: {onChange}} = props
        onChange(enabled => this.setState({enabled}))
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
                    onClick={this.onClick}>
                    {this.renderContent()}
                </div>
            </Portal>
        )
    }

    onClick(e) {
        e.stopPropagation()
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
    connect(),
    withEnableDetector()
)

Panel.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    type: PropTypes.oneOf(['normal', 'modal', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center', 'inline'])
}

Panel.Header = PanelHeader
Panel.Content = PanelContent
Panel.Buttons = PanelButtons
