import {Button, ButtonGroup} from 'widget/button'
import {Modal} from 'widget/modal'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import Icon from 'widget/icon'
import Keybinding from 'widget/keybinding'
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
            : <Portal type='section'>
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
    render() {
        const {className, children} = this.props
        return (
            <ScrollableContainer className={styles.scrollableContainer}>
                <Scrollable className={[styles.content, className].join(' ')}>
                    {children}
                </Scrollable>
            </ScrollableContainer>
        )
    }
}

PanelContent.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

// BUTTONS --------------------------------------------------------------------

export class PanelButtons extends React.Component {
    static renderButton({template, type, look, icon, label, dots, shown = true, disabled = false, onClick}, key) {
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
                icon: 'plus',
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
            },
            save: {
                type: 'submit',
                look: 'apply',
                icon: 'check',
                label: msg('button.save')
            },
            select: {
                type: 'submit',
                look: 'apply',
                icon: 'check',
                label: msg('button.select')
            },
            discard: {
                look: 'cancel',
                icon: 'times',
                label: msg('button.discard')
            }
        }
        return (
            <Button
                key={key}
                type={type || defaultByTemplate[template].type}
                look={look || defaultByTemplate[template].look}
                icon={icon || defaultByTemplate[template].icon}
                label={[label || defaultByTemplate[template].label, dots ? '...' : null].join('')}
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

    static Save(props) {
        return PanelButtons.renderButton({template: 'save', ...props})
    }

    static Select(props) {
        return PanelButtons.renderButton({template: 'select', ...props})
    }

    static Discard(props) {
        return PanelButtons.renderButton({template: 'discard', ...props})
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
        const {className, shown = true, onEnter, onEscape, children} = this.props
        return shown ? (
            <div className={[styles.buttons, className].join(' ')}>
                <Keybinding keymap={{
                    Enter: onEnter,
                    Escape: onEscape
                }}>
                    {children ? children : this.renderButtons()}
                </Keybinding>
            </div>
        ) : null
    }
}

const buttonPropTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    dots: PropTypes.any,
    icon: PropTypes.string,
    label: PropTypes.string,
    look: PropTypes.oneOf(['default', 'highlight', 'transparent', 'cancel', 'apply', 'add']),
    shown: PropTypes.any,
    template: PropTypes.oneOf(['cancel', 'apply', 'confirm', 'close', 'add', 'back', 'next', 'done']),
    type: PropTypes.string
}

const buttonsPropTypes = PropTypes.arrayOf(
    PropTypes.shape(buttonPropTypes)
)

PanelButtons.propTypes = {
    buttons: buttonsPropTypes,
    children: PropTypes.any,
    className: PropTypes.string,
    extraButtons: buttonsPropTypes,
    shown: PropTypes.any
}

PanelButtons.Main.propTypes = {
    children: PropTypes.any.isRequired,
    onEnter: PropTypes.func,
    onEscape: PropTypes.func
}

PanelButtons.Extra.propTypes = {
    children: PropTypes.any
}

PanelButtons.Add.propTypes = buttonPropTypes
PanelButtons.Apply.propTypes = buttonPropTypes
PanelButtons.Back.propTypes = buttonPropTypes
PanelButtons.Cancel.propTypes = buttonPropTypes
PanelButtons.Close.propTypes = buttonPropTypes
PanelButtons.Confirm.propTypes = buttonPropTypes
PanelButtons.Discard.propTypes = buttonPropTypes
PanelButtons.Done.propTypes = buttonPropTypes
PanelButtons.Next.propTypes = buttonPropTypes
PanelButtons.Save.propTypes = buttonPropTypes
