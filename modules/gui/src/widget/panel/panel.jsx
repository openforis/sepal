import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
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
        this.onBackdropClick = this.onBackdropClick.bind(this)
        this.onContentClick = this.onContentClick.bind(this)
        const {enableDetector: {onChange}} = props
        onChange(enabled => this.setState({enabled}))
    }

    render() {
        const {placement} = this.props
        switch (placement) {
            case 'modal':
                return this.renderModal()
            case 'inline':
                return this.renderInline()
            default:
                return this.renderOverlay(placement)
        }
    }

    renderModal() {
        return (
            <Portal type='global' center>
                <div
                    className={styles.modalWrapper}
                    onClick={this.onBackdropClick}>
                    {this.renderContent()}
                </div>
            </Portal>
        )
    }

    onBackdropClick(e) {
        const {onBackdropClick} = this.props
        onBackdropClick && onBackdropClick()
        e.stopPropagation()
    }

    onContentClick(e) {
        e.stopPropagation()
    }

    renderInline() {
        return this.renderContent()
    }

    renderOverlay(placement) {
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
            ].join(' ')} onClick={this.onContentClick}>
                {children}
            </div>
        )
    }
}

export const Panel = compose(
    _Panel,
    withEnableDetector(),
    asFunctionalComponent({
        placement: 'modal'
    })
)

Panel.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    placement: PropTypes.oneOf(['modal', 'inline', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center']),
    onBackdropClick: PropTypes.func
}

Panel.Header = PanelHeader
Panel.Content = PanelContent
Panel.Buttons = PanelButtons
