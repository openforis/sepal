import {FormPanelContext} from './panel'
import {Panel} from 'widget/panel/panel'
import PropTypes from 'prop-types'
import React from 'react'

export class FormPanelButtons extends React.Component {
    renderExtraButtons() {
        const {children} = this.props
        return children ? (
            <Panel.Buttons.Extra>
                {children}
            </Panel.Buttons.Extra>
        ) : null
    }

    renderForm({isActionForm, dirty, invalid, onOk, onCancel}) {
        const {applyLabel} = this.props
        const canSubmit = isActionForm || dirty
        const onEnter =
            invalid
                ? null
                : onOk
        const onEscape = invalid || canSubmit ? onCancel : onOk
        return (
            <Panel.Buttons
                onEnter={onEnter}
                onEscape={onEscape}>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Cancel
                        shown={canSubmit}
                        onClick={onCancel}/>
                    <Panel.Buttons.Apply
                        type={'submit'}
                        label={applyLabel}
                        shown={canSubmit}
                        disabled={invalid}
                        onClick={onOk}/>
                    <Panel.Buttons.Close
                        type={'submit'}
                        label={applyLabel}
                        shown={!canSubmit}
                        onClick={onOk}/>
                </Panel.Buttons.Main>
                {this.renderExtraButtons()}
            </Panel.Buttons>
        )
    }

    renderWizard({invalid, first, last, onBack, onNext, onDone}) {
        const onEnter =
            invalid
                ? null
                : last
                    ? onDone
                    : onNext
        return (
            <Panel.Buttons
                onEnter={onEnter}>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Back
                        shown={!first}
                        onClick={onBack}/>
                    <Panel.Buttons.Done
                        shown={last}
                        disabled={invalid}
                        onClick={onDone}/>
                    <Panel.Buttons.Next
                        shown={!last}
                        disabled={invalid}
                        onClick={onNext}/>
                </Panel.Buttons.Main>
                {this.renderExtraButtons()}
            </Panel.Buttons>
        )
    }

    render() {
        return (
            <FormPanelContext.Consumer>
                {props => {
                    const inWizard = props.wizard && props.wizard.includes(props.id)
                    const renderProps = {...props, ...this.props}
                    return inWizard ? this.renderWizard(renderProps) : this.renderForm(renderProps)
                }}
            </FormPanelContext.Consumer>
        )
    }
}

FormPanelButtons.propTypes = {
    applyLabel: PropTypes.string,
    children: PropTypes.any
}
