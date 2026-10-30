import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {withEnabled} from '~/enabled'
import {uuid} from '~/uuid'
import {Portal, PortalContext} from '~/widget/portal'
import {withTabDialogs} from '~/widget/tabs/tabContext'
import {isMobile} from '~/widget/userAgent'

import {BlurDetector} from '../blurDetector'
import {ModalScope, withModalScope} from './modalScope'
import styles from './panel.module.css'
import {PanelButtons} from './panelButtons'
import {PanelContent} from './panelContent'
import {PanelHeader} from './panelHeader'
import {PanelTabs} from './panelTabs'

// A modal panel is the application's unless it belongs to a recipe (modalScope.jsx): then it is its tab's dialog,
// rendered in the tab's dialog layer (tabContent.jsx), covering that tab alone and shown only while the tab is. Clicking
// outside it within the tab dismisses it as its backdrop would; anything outside the tab - its handle, the menu - does
// not. Covered by a dialog opened after it, it is inert. Focus it held when its tab was left is given back on return,
// except on a mobile device, where leaving drops focus to close the keyboard (enabled.jsx) and returning leaves it so.
// What a modal panel resolves is the scope of everything it renders, nested dialogs included.
class _Panel extends React.Component {
    dialogId = uuid()

    constructor(props) {
        super(props)
        this.dialogBoundary = this.dialogBoundary.bind(this)
        this.rememberFocus = this.rememberFocus.bind(this)
    }

    render() {
        const {placement} = this.props
        switch (placement) {
            case 'modal':
                return (
                    <ModalScope scope={this.scope()} dialogId={this.isTabDialog() ? this.dialogId : undefined}>
                        {this.isTabDialog() ? this.renderTabDialog() : this.renderModal()}
                    </ModalScope>
                )
            case 'inline':
                return this.renderInline()
            default:
                return this.renderOverlay(placement)
        }
    }

    componentDidMount() {
        if (this.isTabDialog()) {
            this.props.tabDialogs.setOpen(this.dialogId, true)
        }
    }

    componentDidUpdate({enabled: wasEnabled}) {
        const {enabled} = this.props
        if (this.isTabDialog() && wasEnabled === false && enabled !== false) {
            this.restoreFocus()
        }
    }

    componentWillUnmount() {
        if (this.isTabDialog()) {
            this.props.tabDialogs.setOpen(this.dialogId, false)
        }
    }

    scope() {
        const {scope, modalScope} = this.props
        return scope || modalScope?.scope || 'application'
    }

    // A recipe's modal panel outside any tab has no tab to keep to, and is the application's.
    isTabDialog() {
        const {placement, tabDialogs} = this.props
        return placement === 'modal' && this.scope() === 'recipe' && !!tabDialogs
    }

    renderTabDialog() {
        const {onBackdropClick, enabled, tabDialogs: {layerId, open}} = this.props
        const index = open.indexOf(this.dialogId)
        const covered = index !== -1 && index < open.length - 1
        return (
            <PortalContext id={layerId}>
                <Portal type='context'>
                    <div
                        className={[
                            styles.modalWrapper,
                            styles.tabDialog
                        ].join(' ')}
                        inert={covered || enabled === false}>
                        <BlurDetector
                            autoBlurTimeout={0}
                            boundary={this.dialogBoundary}
                            onBlur={onBackdropClick}>
                            {this.renderContent()}
                        </BlurDetector>
                    </div>
                </Portal>
            </PortalContext>
        )
    }

    // The tab the dialog covers: its layer's container is the tab's content.
    dialogBoundary() {
        const {tabDialogs: {layerId}} = this.props
        return document.getElementById(layerId)?.parentElement
    }

    rememberFocus(e) {
        this.focused = e.target
    }

    restoreFocus() {
        const focused = this.focused
        if (!isMobile() && focused?.isConnected && focused.closest(`.${styles.panel}`)) {
            focused.focus({preventScroll: true})
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

    // A tab dialog inherits visibility from its DOM owner, including the section's exit fade. Its interaction is
    // disabled immediately, but hiding its paint early would expose the recipe beneath it during that fade.
    // Other panels keep their existing immediate hide/show behavior.
    renderContent() {
        const {className, placement, enabled, children} = this.props
        return (
            <div
                className={[
                    styles.panel,
                    styles[placement],
                    enabled === false && !this.isTabDialog() ? styles.disabled : null,
                    className
                ].join(' ')}
                onFocus={this.isTabDialog() ? this.rememberFocus : undefined}>
                {children}
            </div>
        )
    }
}

export const Panel = compose(
    _Panel,
    withEnabled(),
    withModalScope(),
    withTabDialogs(),
    asFunctionalComponent({
        placement: 'modal'
    })
)

Panel.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    placement: PropTypes.oneOf(['modal', 'inline', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center']),
    // Overrides the scope a modal panel would inherit (modalScope.jsx), for it and what it renders.
    scope: PropTypes.oneOf(['recipe', 'application']),
    onBackdropClick: PropTypes.func
}

Panel.Header = PanelHeader
Panel.Content = PanelContent
Panel.Buttons = PanelButtons
Panel.Tabs = PanelTabs
