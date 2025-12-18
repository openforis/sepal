import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {withEnableDetector} from '~/enabled'
import {Portal} from '~/widget/portal'

import styles from './panel.module.css'
import {PanelButtons} from './panelButtons'
import {PanelContent} from './panelContent'
import {PanelHeader} from './panelHeader'

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
        const {placement} = this.props
        switch (placement) {
            case 'inline':
                return this.renderNormal()
            case 'modal':
                return this.renderModal()
            default:
                return this.renderPortal(placement)
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

    renderPortal(placement) {
        return (
            <Portal type='context'>
                {placement === 'center'
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
        const {className, placement, children} = this.props
        const {enabled} = this.state
        return (
            <div className={[
                styles.panel,
                styles[placement],
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
    placement: PropTypes.oneOf(['inline', 'modal', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center'])
}

Panel.Header = PanelHeader
Panel.Content = PanelContent
Panel.Buttons = PanelButtons
