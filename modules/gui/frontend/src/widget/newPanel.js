import {Button, ButtonGroup} from 'widget/button'
import {Modal} from 'widget/modal'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './newPanel.module.css'

export class Panel extends React.Component {
    renderContent() {
        const {className, children} = this.props
        return (
            <div className={[styles.panel, className].join(' ')}>
                {children}
            </div>
        )
    }

    renderModal(content) {
        const {modal} = this.props
        return modal
            ? (
                <Modal>{content}</Modal>
            ) : content
    }

    render() {
        return this.renderModal(
            this.renderContent()
        )
    }
}

Panel.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    modal: PropTypes.any
}

// HEADER ---------------------------------------------------------------------

export class PanelHeader extends React.Component {
    renderDefault() {
        const {icon, title, label} = this.props
        return (
            <React.Fragment>
                <div>
                    {icon ? <Icon name={icon}/> : null}
                    {title}
                </div>
                {label ? <div>{label}</div> : null}
            </React.Fragment>
        )
    }
    render() {
        const {className, children} = this.props
        return (
            <div className={[styles.header, className].join(' ')}>
                {children ? children : this.renderDefault()}
            </div>
        )
    }
}

PanelHeader.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    icon: PropTypes.string,
    label: PropTypes.string,
    title: PropTypes.string
}

// CONTENT --------------------------------------------------------------------

export class PanelContent extends React.Component {
    render () {
        const {className, children} = this.props
        return (
            <div className={[styles.content, className].join(' ')}>
                {children}
            </div>
        )
    }
}

PanelContent.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}

// BUTTONS --------------------------------------------------------------------

export class PanelButtons extends React.Component {
    renderButton({type, look, icon, label, shown = true, disabled = false, onClick}, key) {
        const defaultByType = {
            look: {
                cancel: 'cancel',
                apply: 'apply',
                confirm: 'apply',
                close: 'apply'
            },
            icon: {
                cancel: 'undo-alt',
                apply: 'check',
                confirm: 'check',
                close: 'times'
            }
        }
        return (
            <Button
                key={key}
                look={look || defaultByType.look[type]}
                icon={icon || defaultByType.icon[type]}
                label={label}
                shown={shown}
                disabled={disabled}
                onClick={e => {
                    e.preventDefault()
                    onClick && onClick()
                }}
                onMouseDown={e => e.preventDefault()} // Prevent onBlur validation before canceling
            />
        )

    }
    
    renderButtonGroup(buttons) {
        return (
            <ButtonGroup>
                {buttons.map((button, index) => this.renderButton(button, index))}
            </ButtonGroup>
        )
    }

    renderMainButtons() {
        const {children, buttons} = this.props
        return buttons ? this.renderButtonGroup(buttons) : children
    }

    renderExtraButtons() {
        const {extraButtons} = this.props
        return this.renderButtonGroup(extraButtons || [])
    }
    
    render() {
        const {className} = this.props
        return (
            <div className={[styles.buttons, className].join(' ')}>
                {this.renderExtraButtons()}
                {this.renderMainButtons()}
            </div>
        )
    }
}

const buttonsPropTypes = PropTypes.arrayOf(
    PropTypes.shape({
        label: PropTypes.string.isRequired,
        type: PropTypes.oneOf(['cancel', 'apply', 'confirm', 'close']).isRequired,
        onClick: PropTypes.func.isRequired,
        disabled: PropTypes.any,
        icon: PropTypes.string,
        look: PropTypes.oneOf(['default', 'highlight', 'transparent', 'cancel', 'apply', 'add']),
        shown: PropTypes.any
    })
)

PanelButtons.propTypes = {
    buttons: buttonsPropTypes,
    children: PropTypes.any,
    className: PropTypes.string,
    extraButtons: buttonsPropTypes
}
