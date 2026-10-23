import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {withEnabled} from '~/enabled'
import {Portal} from '~/widget/portal'

import {BlurDetector} from '../blurDetector'
import styles from './panel.module.css'
import {PanelButtons} from './panelButtons'
import {PanelContent} from './panelContent'
import {PanelHeader} from './panelHeader'
import {PanelTabs} from './panelTabs'

class _Panel extends React.Component {
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
        const {onBackdropClick} = this.props
        return (
            <Portal type='global' center>
                <div className={styles.modalWrapper}>
                    <BlurDetector
                        autoBlurTimeout={0}
                        onBlur={onBackdropClick}>
                        {this.renderContent()}
                    </BlurDetector>
                </div>
            </Portal>
        )
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

    // Not displayed while what it is in is disabled - a tab not selected - and displayed again in the render that enables
    // it, so what its content does on being enabled finds it displayed.
    renderContent() {
        const {className, placement, enabled, children} = this.props
        return (
            <div className={[
                styles.panel,
                styles[placement],
                enabled === false ? styles.disabled : null,
                className
            ].join(' ')}>
                {children}
            </div>
        )
    }
}

export const Panel = compose(
    _Panel,
    withEnabled(),
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
Panel.Tabs = PanelTabs
