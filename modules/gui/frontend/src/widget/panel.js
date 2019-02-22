import {Button, ButtonGroup} from 'widget/button'
import {Modal} from 'widget/modal'
import {msg} from 'translate'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './panel.module.css'

// PANEL ----------------------------------------------------------------------

export class Panel extends React.Component {
    renderContent() {
        const {className, type, children} = this.props
        return (
            <div className={[
                styles.panel,
                styles[type],
                className
            ].join(' ')}>
                {children}
            </div>
        )
    }

    renderModal(content) {
        const {type} = this.props
        return type === 'modal'
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
    type: PropTypes.oneOf(['modal', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center', 'inline'])
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
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

// BUTTONS --------------------------------------------------------------------

export class PanelButtons extends React.Component {
    static renderButton({template, type, look, icon, label, shown = true, disabled = false, onClick}, key) {
        const defaultByTemplate = {
            cancel: {
                look: 'cancel',
                icon: 'undo-alt',
                label: msg('button.cancel')
            },
            apply: {
                look: 'apply',
                icon: 'check',
                label: msg('button.apply')
            },
            confirm: {
                look: 'apply',
                icon: 'check',
                label: msg('button.confirm')
            },
            close: {
                look: 'apply',
                icon: 'times',
                label: msg('button.close')
            },
            add: {
                look: 'add',
                icon: 'pencil-alt',
                label: msg('button.add')
            },
            back: {
                look: 'default',
                icon: 'chevron-left',
                label: msg('button.back')
            },
            next: {
                look: 'apply',
                icon: 'chevron-right',
                label: msg('button.next')
            },
            done: {
                look: 'apply',
                icon: 'check',
                label: msg('button.done')
            }
        }
        return (
            <Button
                key={key}
                type={type}
                look={look || defaultByTemplate[template].look}
                icon={icon || defaultByTemplate[template].icon}
                label={label || defaultByTemplate[template].label}
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

    static Cancel(props) {
        return PanelButtons.renderButton({template: 'cancel', ...props})
    }

    static Apply(props) {
        return PanelButtons.renderButton({template: 'apply', ...props})
    }

    static Close(props) {
        return PanelButtons.renderButton({template: 'close', ...props})
    }

    static Confirm(props) {
        return PanelButtons.renderButton({template: 'confirm', ...props})
    }

    static Add(props) {
        return PanelButtons.renderButton({template: 'add', ...props})
    }

    static Back(props) {
        return PanelButtons.renderButton({template: 'back', ...props})
    }

    static Next(props) {
        return PanelButtons.renderButton({template: 'next', ...props})
    }

    static Done(props) {
        return PanelButtons.renderButton({template: 'done', ...props})
    }

    static Main({children}) {
        return (
            <ButtonGroup className={styles.main} type='horizontal-nowrap'>
                {children}
            </ButtonGroup>
        )
    }

    static Extra({children}) {
        return (
            <ButtonGroup className={styles.extras} type='horizontal-nowrap'>
                {children}
            </ButtonGroup>
        )
    }

    renderButtonGroup(buttons) {
        return (
            <ButtonGroup>
                {buttons.map((button, index) => PanelButtons.renderButton(button, index))}
            </ButtonGroup>
        )
    }

    renderMainButtons() {
        const {buttons} = this.props
        return this.renderButtonGroup(buttons)
    }

    renderExtraButtons() {
        const {extraButtons} = this.props
        return this.renderButtonGroup(extraButtons || [])
    }

    renderButtons() {
        return (
            <React.Component>
                {this.renderExtraButtons()}
                {this.renderMainButtons()}
            </React.Component>
        )
    }

    render() {
        const {className, shown = true, children} = this.props
        return shown ? (
            <div className={[styles.buttons, className].join(' ')}>
                {children ? children : this.renderButtons()}
            </div>
        ) : null
    }
}

const buttonsPropTypes = PropTypes.arrayOf(
    PropTypes.shape({
        onClick: PropTypes.func.isRequired,
        disabled: PropTypes.any,
        icon: PropTypes.string,
        label: PropTypes.string,
        look: PropTypes.oneOf(['default', 'highlight', 'transparent', 'cancel', 'apply', 'add']),
        shown: PropTypes.any,
        template: PropTypes.oneOf(['cancel', 'apply', 'confirm', 'close', 'add', 'back', 'next', 'done'])
    })
)

PanelButtons.propTypes = {
    buttons: buttonsPropTypes,
    children: PropTypes.any,
    className: PropTypes.string,
    extraButtons: buttonsPropTypes,
    shown: PropTypes.any
}

PanelButtons.Main.propTypes = {
    children: PropTypes.any.isRequired
}

PanelButtons.Extra.propTypes = {
    children: PropTypes.any
}

PanelButtons.Cancel.propTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    shown: PropTypes.any,
    size: PropTypes.string
}

PanelButtons.Apply.propTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    shown: PropTypes.any,
    size: PropTypes.string
}

PanelButtons.Close.propTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    shown: PropTypes.any,
    size: PropTypes.string
}

PanelButtons.Confirm.propTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    label: PropTypes.string,
    shown: PropTypes.any,
    size: PropTypes.string
}

PanelButtons.Add.propTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    label: PropTypes.string,
    shown: PropTypes.any,
    size: PropTypes.string
}

PanelButtons.Back.propTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    label: PropTypes.string,
    shown: PropTypes.any,
    size: PropTypes.string
}

PanelButtons.Next.propTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    label: PropTypes.string,
    shown: PropTypes.any,
    size: PropTypes.string
}

PanelButtons.Done.propTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    label: PropTypes.string,
    shown: PropTypes.any,
    size: PropTypes.string
}
