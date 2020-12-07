import {FormPanelContext} from './panel'
import {Panel} from 'widget/panel/panel'
import PropTypes from 'prop-types'
import React from 'react'

export class FormPanelButtons extends React.Component {
    render() {
        return (
            <FormPanelContext.Consumer>
                {props => {
                    const renderProps = {...props, ...this.props}
                    const inWizard = renderProps.wizard && renderProps.wizard.includes(renderProps.id)
                    return inWizard ? this.renderWizard(renderProps) : this.renderForm(renderProps)
                }}
            </FormPanelContext.Consumer>
        )
    }

    renderForm({isActionForm, dirty, invalid, onOk, onCancel}) {
        const {applyLabel} = this.props
        const canSubmit = isActionForm || dirty
        const onEnter = invalid ? null : onOk
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

    renderWizard({closable, isActionForm, dirty, invalid, first, last, onBack, onNext, onDone, onCancel}) {
        const {applyLabel} = this.props
        const canSubmit = isActionForm || dirty
        const onEnter =
            invalid
                ? null
                : last
                    ? onDone
                    : onNext
        const onEscape = invalid || canSubmit ? onCancel : onDone
        return (
            <Panel.Buttons
                onEnter={onEnter}
                onEscape={closable && onEscape}>
                <Panel.Buttons.Main>
                    {closable
                        ? <Panel.Buttons.Cancel
                            shown={canSubmit}
                            onClick={onCancel}/>
                        : null
                    }
                    {closable
                        ? <Panel.Buttons.Close
                            type={'submit'}
                            label={applyLabel}
                            shown={!canSubmit}
                            onClick={onDone}/>
                        : null
                    }
                    <Panel.Buttons.Back
                        shown={!first || closable}
                        disabled={first}
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
