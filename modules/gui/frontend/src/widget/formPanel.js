import {Form} from 'widget/form'
import {Panel, PanelButtons} from 'widget/panel'
import {PanelButtonContext} from './toolbar'
import {PanelWizardContext} from './panelWizard'
import {connect} from 'store'
import {isObservable} from 'rxjs'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './formPanel.module.css'
const PanelContext = React.createContext()

class FormPanel extends React.Component {
    apply(onSuccess) {
        const {form, onApply} = this.props
        const result = onApply(form && form.values())
        if (isObservable(result)) {
            const result$ = result
            this.props.stream('FORM_PANEL_APPLY', result$,
                () => null,
                _error => null,
                () => onSuccess()
            )
        } else {
            onSuccess && onSuccess()
        }

        return true
    }

    ok() {
        const {form, isActionForm, close} = this.props
        if (form && (isActionForm || form.isDirty())) {
            this.apply(() => close())
        } else {
            this.cancel()
        }
    }

    cancel() {
        const {onCancel, close} = this.props
        onCancel && onCancel()
        close()
    }

    renderSpinner() {
        return this.props.stream('FORM_PANEL_APPLY') === 'ACTIVE'
            ? (
                <div className={styles.spinner}>
                    <Icon name='spinner'/>
                </div>
            )
            : null
    }

    render() {
        const {
            form = false, isActionForm, onApply, type = 'modal', className, children,
            placement
        } = this.props
        return (
            <PanelWizardContext>
                {({wizard, back, next, done}) => {
                    return (
                        <PanelButtonContext.Consumer>
                            {placementFromContext => (
                                <PanelContext.Provider value={{
                                    wizard,
                                    first: !back,
                                    last: !next,
                                    isActionForm: form && isActionForm,
                                    dirty: form && form.isDirty(),
                                    invalid: form && form.isInvalid(),
                                    onOk: () => this.ok(),
                                    onCancel: () => this.cancel(),
                                    onBack: () => back && this.apply(() => back()),
                                    onNext: () => next && this.apply(() => next()),
                                    onDone: () => done && this.apply(() => done())
                                }}>
                                    <Panel
                                        id={this.props.id}
                                        className={className}
                                        type={placement || placementFromContext || type}>
                                        <Form onSubmit={() => onApply && onApply(form && form.values())}>
                                            {children}
                                        </Form>
                                        {this.renderSpinner()}
                                    </Panel>
                                </PanelContext.Provider>
                            )}
                        </PanelButtonContext.Consumer>
                    )
                }}
            </PanelWizardContext>
        )
    }
}

export default connect()(FormPanel)

FormPanel.propTypes = {
    children: PropTypes.any.isRequired,
    form: PropTypes.object.isRequired,
    className: PropTypes.string,
    close: PropTypes.func,
    isActionForm: PropTypes.any,
    placement: PropTypes.oneOf(['modal', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center', 'inline']),
    policy: PropTypes.func,
    type: PropTypes.string, // TODO: Same as type?
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
}

export class FormPanelButtons extends React.Component {
    renderWizardButtons({invalid, first, last, onBack, onNext, onDone}) {
        return (
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
        )
    }

    renderFormButtons({isActionForm, dirty, invalid, onOk, onCancel}) {
        const {applyLabel} = this.props
        const canSubmit = isActionForm || dirty
        return (
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
        )
    }

    renderMainButtons({isActionForm, wizard, first, last, dirty, invalid, onOk, onCancel, onBack, onNext, onDone}) {
        return wizard
            ? this.renderWizardButtons({first, last, invalid, onBack, onNext, onDone})
            : this.renderFormButtons({isActionForm, dirty, invalid, onOk, onCancel})
    }

    renderExtraButtons() {
        const {children} = this.props
        return children ? (
            <PanelButtons.Extra>
                {children}
            </PanelButtons.Extra>
        ) : null
    }

    render() {
        return (
            <PanelContext.Consumer>
                {props => (
                    <PanelButtons>
                        {this.renderMainButtons(props)}
                        {this.renderExtraButtons()}
                    </PanelButtons>
                )}
            </PanelContext.Consumer>
        )
    }
}

FormPanelButtons.propTypes = {
    applyLabel: PropTypes.string,
    children: PropTypes.any
}
