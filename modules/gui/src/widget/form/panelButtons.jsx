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

    renderFormPanelButtons(props) {
        const renderProps = {...props, ...this.props}
        const inWizard = renderProps.wizard && renderProps.wizard.includes(renderProps.id)
        return inWizard ? this.renderInWizard(renderProps) : this.renderInForm(renderProps)
    }

    renderInForm({state: {busy, submittable, invalid}, actions: {cancel, ok, close}}) {
        const {applyLabel, disabled, disabledCancel} = this.props
        return (
            <Panel.Buttons>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Cancel
                        hidden={!submittable || disabled || disabledCancel}
                        keybinding='Escape'
                        onClick={cancel}/>
                    <Panel.Buttons.Apply
                        type={'submit'}
                        label={applyLabel}
                        hidden={!submittable}
                        disabled={disabled || invalid}
                        keybinding='Enter'
                        busy={busy}
                        onClick={ok}/>
                    <Panel.Buttons.Close
                        type={'submit'}
                        label={applyLabel}
                        hidden={submittable}
                        disabled={disabled}
                        keybinding={['Enter', 'Escape']}
                        onClick={close}/>
                </Panel.Buttons.Main>
                {this.renderExtraButtons()}
            </Panel.Buttons>
        )
    }

    renderInWizard({state: {invalid, first, last}, actions: {back, next, done}}) {
        return (
            <Panel.Buttons>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Back
                        hidden={first}
                        disabled={first}
                        onClick={back}/>
                    <Panel.Buttons.Next
                        hidden={last}
                        disabled={invalid}
                        keybinding='Enter'
                        onClick={next}/>
                    <Panel.Buttons.Done
                        hidden={!last}
                        disabled={invalid}
                        keybinding='Enter'
                        onClick={done}/>
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
