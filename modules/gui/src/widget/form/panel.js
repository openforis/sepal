import {Form} from 'widget/form/form'
import {Panel} from 'widget/panel/panel'
import {PanelButtonContext} from 'widget/toolbar/panelButtonContext'
import {PanelWizardContext, withPanelWizardContext} from '../panelWizard'
import {compose} from 'compose'
import {connect} from 'store'
import {isObservable} from 'rxjs'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './panel.module.css'

export const FormPanelContext = React.createContext()

class _FormPanel extends React.Component {
    autoCancel = true

    state = {
        confirm: false,
        confirmed: false,
        onSuccess: null
    }

    constructor(props) {
        super(props)
        this.confirm = this.confirm.bind(this)
        this.reject = this.reject.bind(this)
    }

    apply(onSuccess) {
        const {form, confirmation, onApply} = this.props
        const {confirmed} = this.state

        if (confirmation && !confirmed) {
            this.setState({confirm: true, onSuccess})
        } else {
            const result = onApply(form && form.values())
            this.autoCancel = false
            if (isObservable(result)) {
                const result$ = result
                this.props.stream('FORM_PANEL_APPLY', result$,
                    () => null,
                    _error => null,
                    () => {
                        onSuccess && onSuccess()
                        this.close()
                    }
                )
            } else {
                onSuccess && onSuccess()
                this.close()
            }
        }
    }

    ok() {
        const {form, isActionForm} = this.props
        if (form && (isActionForm || form.isDirty())) {
            this.apply()
        } else {
            this.cancel()
        }
    }

    cancel() {
        const {onCancel} = this.props
        this.autoCancel = false
        onCancel && onCancel()
        this.close()
    }

    close() {
        const {onClose} = this.props
        onClose && onClose()
    }

    confirm() {
        const {onSuccess} = this.state
        this.setState({confirmed: true}, () => this.apply(onSuccess))
    }

    reject() {
        this.setState({confirm: false})
    }

    renderSpinner() {
        return this.props.stream('FORM_PANEL_APPLY').active
            ? (
                <div className={styles.spinner}>
                    <Icon name='spinner'/>
                </div>
            )
            : null
    }

    render() {
        const {confirm} = this.state
        return (
            <React.Fragment>
                {this.renderPanel()}
                {confirm ? this.renderConfirmation() : null}
            </React.Fragment>
        )
    }

    renderConfirmation() {
        const {confirmation} = this.props
        return confirmation({
            confirm: this.confirm,
            cancel: this.reject
        })
    }

    renderPanel() {
        const {id, form = false, isActionForm, onApply, type = 'modal', className, children, placement} = this.props
        return (
            <PanelWizardContext>
                {({wizard, back, next, done}) => {
                    return (
                        <PanelButtonContext.Consumer>
                            {placementFromContext => (
                                <FormPanelContext.Provider value={{
                                    id,
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
                                        <Form onSubmit={(...args) => {
                                            console.warn('Unexpected PanelForm onSubmit called', args)
                                            onApply && onApply(form && form.values())
                                        }}>
                                            {children}
                                        </Form>
                                        {this.renderSpinner()}
                                    </Panel>
                                </FormPanelContext.Provider>
                            )}
                        </PanelButtonContext.Consumer>
                    )
                }}
            </PanelWizardContext>
        )
    }

    componentWillUnmount() {
        const {wizardContext: {wizard} = {}} = this.props
        if (wizard) {
            this.close()
        } else {
            this.autoCancel && this.cancel()
        }
    }
}

export const FormPanel = compose(
    _FormPanel,
    connect(),
    withPanelWizardContext()
)

FormPanel.propTypes = {
    children: PropTypes.any.isRequired,
    form: PropTypes.object.isRequired,
    className: PropTypes.string,
    confirmation: PropTypes.func,
    isActionForm: PropTypes.any,
    placement: PropTypes.oneOf(['modal', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center', 'inline']),
    policy: PropTypes.func,
    type: PropTypes.string,
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
    onClose: PropTypes.func
}
