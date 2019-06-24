import {FormPanelContext} from './panel'
import {PanelButtons} from 'widget/panel'
import PropTypes from 'prop-types'
import React from 'react'

export class FormPanelButtons extends React.Component {
    renderExtraButtons() {
        const {children} = this.props
        return children ? (
            <PanelButtons.Extra>
                {children}
            </PanelButtons.Extra>
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
            <PanelButtons
                onEnter={onEnter}
                onEscape={onEscape}>
                <PanelButtons.Main>
                    <PanelButtons.Cancel
                        shown={canSubmit}
                        onClick={onCancel}/>
                    <PanelButtons.Apply
                        type={'submit'}
                        label={applyLabel}
                        shown={canSubmit}
                        disabled={invalid}
                        onClick={onOk}/>
                    <PanelButtons.Close
                        type={'submit'}
                        label={applyLabel}
                        shown={!canSubmit}
                        onClick={onOk}/>
                </PanelButtons.Main>
                {this.renderExtraButtons()}
            </PanelButtons>
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
            <PanelButtons
                onEnter={onEnter}>
                <PanelButtons.Main>
                    <PanelButtons.Back
                        shown={!first}
                        onClick={onBack}/>
                    <PanelButtons.Done
                        shown={last}
                        disabled={invalid}
                        onClick={onDone}/>
                    <PanelButtons.Next
                        shown={!last}
                        disabled={invalid}
                        onClick={onNext}/>
                </PanelButtons.Main>
                {this.renderExtraButtons()}
            </PanelButtons>
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
