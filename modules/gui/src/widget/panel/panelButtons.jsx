import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'

import styles from './panelButtons.module.css'

export class PanelButtons extends React.Component {
    static renderButton({template, type, look, icon, label, dots, hidden, disabled, keybinding, onClick}, key) {
        const defaultByTemplate = {
            cancel: {
                look: 'cancel',
                icon: 'undo-alt',
                label: msg('button.cancel')
            },
            apply: {
                look: 'apply',
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
            },
            remove: {
                look: 'cancel',
                icon: 'times',
                label: msg('button.remove')
            }
        }
        return (
            <Button
                key={key}
                type={type || defaultByTemplate[template].type}
                look={look || defaultByTemplate[template].look}
                icon={icon || defaultByTemplate[template].icon}
                label={[label || defaultByTemplate[template].label, dots ? '...' : null].join('')}
                hidden={hidden}
                disabled={disabled}
                keybinding={keybinding}
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

    static Apply({busy, ...props}) {
        return PanelButtons.renderButton({template: 'apply', icon: busy ? 'spinner' : 'check', ...props})
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

    static Remove(props) {
        return PanelButtons.renderButton({template: 'remove', ...props})
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
            <ButtonGroup className={styles.main} layout='horizontal-nowrap'>
                {children}
            </ButtonGroup>
        )
    }

    static Extra({children}) {
        return (
            <ButtonGroup className={styles.extras} layout='horizontal-nowrap'>
                {children}
            </ButtonGroup>
        )
    }

    render() {
        const {className, children} = this.props
        return (
            <div className={[styles.buttons, className].join(' ')}>
                {children ? children : this.renderButtons()}
            </div>
        )
    }

    renderButtons() {
        return (
            <React.Component>
                {this.renderExtraButtons()}
                {this.renderMainButtons()}
            </React.Component>
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

    renderButtonGroup(buttons) {
        return (
            <ButtonGroup>
                {buttons.map((button, index) => PanelButtons.renderButton(button, index))}
            </ButtonGroup>
        )
    }
}

const buttonPropTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    dots: PropTypes.any,
    hidden: PropTypes.any,
    icon: PropTypes.string,
    keybinding: PropTypes.any,
    label: PropTypes.string,
    look: PropTypes.oneOf(['default', 'highlight', 'transparent', 'cancel', 'apply', 'add']),
    template: PropTypes.oneOf(['cancel', 'apply', 'confirm', 'close', 'add', 'back', 'next', 'done']),
    type: PropTypes.string
}

const buttonsPropTypes = PropTypes.arrayOf(
    PropTypes.shape(buttonPropTypes)
)

PanelButtons.propTypes = {
    children: PropTypes.any.isRequired,
    buttons: buttonsPropTypes,
    className: PropTypes.string,
    extraButtons: buttonsPropTypes
}

PanelButtons.Main.propTypes = {
    children: PropTypes.any.isRequired
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
PanelButtons.Remove.propTypes = buttonPropTypes
PanelButtons.Done.propTypes = buttonPropTypes
PanelButtons.Next.propTypes = buttonPropTypes
PanelButtons.Save.propTypes = buttonPropTypes
