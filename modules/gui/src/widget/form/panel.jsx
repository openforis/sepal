import PropTypes from 'prop-types'
import React from 'react'
import {isObservable} from 'rxjs'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {FormContainer} from '~/widget/form/container'
import {Panel} from '~/widget/panel/panel'
import {PanelButtonContext} from '~/widget/toolbar/panelButtonContext'

import {withPanelWizard} from '../panelWizard'

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
        this.submit = this.submit.bind(this)
        this.ok = this.ok.bind(this)
        this.cancel = this.cancel.bind(this)
        this.close = this.close.bind(this)
        this.back = this.back.bind(this)
        this.next = this.next.bind(this)
        this.done = this.done.bind(this)
    }

    isDirty() {
        const {form, isActionForm} = this.props
        return form && (isActionForm || form.isDirty())
    }

    isBusy() {
        const {stream} = this.props
        return stream('FORM_PANEL_APPLY').active
    }

    isInvalid() {
        const {form} = this.props
        return form && form.isInvalid()
    }

    onClose() {
        const {onClose} = this.props
        onClose && onClose()
    }

    apply(onSuccess) {
        const {form, confirmation, onApply, onError} = this.props
        const {confirmed} = this.state

        if (confirmation && !confirmed) {
            this.setState({confirm: true, onSuccess})
        } else {
            const result = onApply(form && form.values())
            this.autoCancel = false
            if (isObservable(result)) {
                this.props.stream({
                    name: 'FORM_PANEL_APPLY',
                    stream$: result,
                    onComplete: () => {
                        onSuccess && onSuccess()
                        this.onClose()
                    },
                    onError: error => {
                        onError && onError(error)
                    }
                })
            } else {
                onSuccess && onSuccess()
                this.onClose()
            }
        }
    }

    ok() {
        if (this.isDirty()) {
            this.apply()
        } else {
            this.cancel()
        }
    }

    cancel() {
        const {onCancel} = this.props
        this.autoCancel = false
        onCancel && onCancel()
        this.onClose()
    }

    close() {
        const {form} = this.props
        if (!(form && form.isDirty())) {
            this.cancel()
        }
    }

    back() {
        const {panelWizard} = this.props
        panelWizard && this.apply(panelWizard.back)
    }

    next() {
        const {panelWizard} = this.props
        panelWizard && this.apply(panelWizard.next)
    }

    done() {
        const {panelWizard} = this.props
        panelWizard && this.apply(panelWizard.done)
    }

    confirm() {
        const {onSuccess} = this.state
        this.setState({confirmed: true}, () => this.apply(onSuccess))
    }

    reject() {
        this.setState({confirm: false})
    }

    submit(...args) {
        const {form = false, onApply} = this.props
        console.warn('Unexpected PanelForm submit() called', args)
        onApply && onApply(form && form.values())
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
        const {id, panelWizard: {wizard, back, next} = {}, className, children, placement} = this.props
        return (
            <PanelButtonContext.Consumer>
                {placementFromContext => (
                    <FormPanelContext.Provider value={{
                        id,
                        wizard,
                        state: {
                            first: !back,
                            last: !next,
                            busy: this.isBusy(),
                            submittable: this.isDirty(),
                            invalid: this.isInvalid(),
                        },
                        actions: {
                            ok: this.ok,
                            cancel: this.cancel,
                            close: this.close,
                            back: this.back,
                            next: this.next,
                            done: this.done
                        }
                    }}>
                        <Panel
                            id={this.props.id}
                            className={className}
                            placement={placement || placementFromContext}
                            onBackdropClick={this.close}>
                            <FormContainer onSubmit={this.submit}>
                                {children}
                            </FormContainer>
                        </Panel>
                    </FormPanelContext.Provider>
                )}
            </PanelButtonContext.Consumer>
        )
    }

    componentWillUnmount() {
        const {panelWizard: {wizard} = {}} = this.props
        if (wizard) {
            this.onClose()
        } else {
            this.autoCancel && this.cancel()
        }
    }
}

export const FormPanel = compose(
    _FormPanel,
    connect(),
    withPanelWizard()
)

FormPanel.propTypes = {
    children: PropTypes.any.isRequired,
    form: PropTypes.object.isRequired,
    className: PropTypes.string,
    confirmation: PropTypes.func,
    isActionForm: PropTypes.any,
    placement: PropTypes.any,
    policy: PropTypes.func,
    type: PropTypes.string,
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
    onClose: PropTypes.func,
    onError: PropTypes.func,
}
