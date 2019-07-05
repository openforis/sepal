import {Modal} from 'widget/modal'
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

    renderContainer(content) {
        const {type} = this.props
        return type === 'modal'
            ? <Modal>{content}</Modal>
            : <Portal>
                <div className={type === 'center' ? styles.centerWrapper : null}>
                    {content}
                </div>
            </Portal>
    }

    render() {
        return this.renderContainer(
            this.renderContent()
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
    type: PropTypes.oneOf(['modal', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center', 'inline'])
}

Panel.Header = PanelHeader
Panel.Content = PanelContent
Panel.Buttons = PanelButtons
