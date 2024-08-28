import PropTypes from 'prop-types'
import React from 'react'

import {Panel} from '~/widget/panel/panel'

import {FormPanelContext} from './panel'

export class FormPanelButtons extends React.Component {
    constructor() {
        super()
        this.renderFormPanelContext = this.renderFormPanelContext.bind(this)
    }

    render() {
        return (
            <FormPanelContext.Consumer>
                {this.renderFormPanelContext}
            </FormPanelContext.Consumer>
        )
    }

    renderFormPanelContext(props) {
        const renderProps = {...props, ...this.props}
        const inWizard = renderProps.wizard && renderProps.wizard.includes(renderProps.id)
        return inWizard ? this.renderInWizard(renderProps) : this.renderInForm(renderProps)
    }

    renderInForm({isActionForm, dirty, invalid, onOk, onCancel}) {
        const {applyLabel, disabled, disabledCancel} = this.props
        const canSubmit = isActionForm || dirty
        return (
            <Panel.Buttons>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Cancel
                        hidden={!canSubmit || disabled || disabledCancel}
                        keybinding='Escape'
                        onClick={onCancel}/>
                    <Panel.Buttons.Apply
                        type={'submit'}
                        label={applyLabel}
                        hidden={!canSubmit}
                        disabled={disabled || invalid}
                        keybinding='Enter'
                        onClick={onOk}/>
                    <Panel.Buttons.Close
                        type={'submit'}
                        label={applyLabel}
                        hidden={canSubmit}
                        disabled={disabled}
                        keybinding={['Enter', 'Escape']}
                        onClick={onOk}/>
                </Panel.Buttons.Main>
                {this.renderExtraButtons()}
            </Panel.Buttons>
        )
    }

    renderInWizard({closable, isActionForm, dirty, invalid, first, last, onBack, onNext, onDone, onCancel}) {
        const {applyLabel} = this.props
        const canSubmit = isActionForm || dirty
        return (
            <Panel.Buttons>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Cancel
                        hidden={!closable || !canSubmit}
                        keybinding='Escape'
                        onClick={onCancel}/>
                    <Panel.Buttons.Close
                        type={'submit'}
                        label={applyLabel}
                        hidden={!closable || canSubmit}
                        keybinding='Enter'
                        onClick={onDone}/>
                    <Panel.Buttons.Back
                        hidden={!closable && first}
                        disabled={first}
                        onClick={onBack}/>
                    <Panel.Buttons.Done
                        hidden={!last}
                        disabled={invalid}
                        keybinding='Enter'
                        onClick={onDone}/>
                    <Panel.Buttons.Next
                        hidden={last}
                        disabled={invalid}
                        keybinding='Enter'
                        onClick={onNext}/>
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
    children: PropTypes.any
}
