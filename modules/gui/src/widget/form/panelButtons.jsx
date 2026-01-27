import PropTypes from 'prop-types'
import React from 'react'

import {Panel} from '~/widget/panel/panel'

import {FormPanelContext} from './panel'

export class FormPanelButtons extends React.Component {
    constructor(props) {
        super(props)
        this.renderFormPanelButtons = this.renderFormPanelButtons.bind(this)
    }

    render() {
        return (
            <FormPanelContext.Consumer>
                {this.renderFormPanelButtons}
            </FormPanelContext.Consumer>
        )
    }

    renderFormPanelButtons(context) {
        const renderProps = {...context, ...this.props}
        const inWizard = renderProps.wizard && renderProps.wizard.includes(renderProps.id)
        return inWizard
            ? this.renderInWizard(renderProps)
            : this.renderInForm(renderProps)
    }

    renderInForm({busy, submittable, invalid, onCancel, onOk, onClose}) {
        const {applyLabel, disabled, disabledCancel} = this.props
        return (
            <Panel.Buttons>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Cancel
                        hidden={!submittable || disabled || disabledCancel}
                        keybinding='Escape'
                        onClick={onCancel}/>
                    <Panel.Buttons.Apply
                        type={'submit'}
                        label={applyLabel}
                        hidden={!submittable}
                        disabled={disabled || invalid}
                        keybinding='Enter'
                        busy={busy}
                        onClick={onOk}/>
                    <Panel.Buttons.Close
                        type={'submit'}
                        label={applyLabel}
                        hidden={submittable}
                        disabled={disabled}
                        keybinding={['Enter', 'Escape']}
                        onClick={onClose}/>
                </Panel.Buttons.Main>
                {this.renderExtraButtons()}
            </Panel.Buttons>
        )
    }

    renderInWizard({closable, submittable, invalid, first, last, onCancel, onBack, onNext, onDone}) {
        const {applyLabel} = this.props
        return (
            <Panel.Buttons>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Cancel
                        hidden={!closable || !submittable}
                        keybinding='Escape'
                        onClick={onCancel}/>
                    <Panel.Buttons.Close
                        type={'submit'}
                        label={applyLabel}
                        hidden={!closable || submittable}
                        keybinding='Enter'
                        onClick={onDone}/>
                    <Panel.Buttons.Back
                        hidden={!closable && first}
                        disabled={first}
                        onClick={onBack}/>
                    <Panel.Buttons.Next
                        hidden={last}
                        disabled={invalid}
                        keybinding='Enter'
                        onClick={onNext}/>
                    <Panel.Buttons.Done
                        hidden={!last}
                        disabled={invalid}
                        keybinding='Enter'
                        onClick={onDone}/>
                </Panel.Buttons.Main>
                {this.renderExtraButtons()}
            </Panel.Buttons>
        )
    }

    renderExtraButtons() {
        const {children} = this.props
        return children ? (
            <Panel.Buttons.Extra>
                {children}
            </Panel.Buttons.Extra>
        ) : null
    }
}

FormPanelButtons.propTypes = {
    applyLabel: PropTypes.string,
    busy: PropTypes.bool,
    children: PropTypes.any
}
