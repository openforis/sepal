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

    // A locked panel keeps Cancel and Close working but never applies: the record it edits is not
    // the one the user sees.
    isInvalid() {
        const {form, locked} = this.props
        return !!locked || (form && form.isInvalid())
    }

    onClose() {
        const {onClose} = this.props
        onClose && onClose()
    }

    // Every submission path arrives here, and nothing is committed from an invalid form. The Apply and
    // wizard buttons already refuse; a keyboard submit reaches the same decision rather than around it.
    apply(onSuccess) {
        const {form, confirmation, onApply, onError} = this.props
        const {confirmed} = this.state

        if (this.isInvalid()) {
            return
        }
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

    // Going back commits nothing invalid, but it still goes back: the button is offered whenever there is a
    // panel behind this one, and a guard that refused to navigate would leave it enabled and inert. The
    // forward steps go on refusing - they are the ones that would commit.
    back() {
        const {panelWizard} = this.props
        if (!panelWizard) {
            return
        }
        if (this.isInvalid()) {
            this.leave(panelWizard.back)
        } else {
            this.apply(panelWizard.back)
        }
    }

    // Leaving the panel the way apply() does, minus the commit.
    leave(navigate) {
        this.autoCancel = false
        navigate && navigate()
        this.onClose()
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

    // Enter in a field submits the surrounding form, and submission means what this panel's own forward
    // button means: Apply on an ordinary panel, and the wizard's own step on one the wizard is walking
    // through - where applying and closing would abandon the sequence the user is in.
    submit() {
        const {panelWizard: {next} = {}} = this.props
        if (this.inWizard()) {
            next ? this.next() : this.done()
        } else {
            this.ok()
        }
    }

    // The same rule the buttons are chosen by: a wizard may be running over panels this one is not part of.
    inWizard() {
        const {id, panelWizard: {wizard} = {}} = this.props
        return !!(wizard && wizard.includes(id))
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
                        first: !back,
                        last: !next,
                        busy: this.isBusy(),
                        submittable: this.isDirty(),
                        invalid: this.isInvalid(),
                        onOk: this.ok,
                        onCancel: this.cancel,
                        onClose: this.close,
                        onBack: this.back,
                        onNext: this.next,
                        onDone: this.done
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
    locked: PropTypes.any,
    placement: PropTypes.any,
    policy: PropTypes.func,
    type: PropTypes.string,
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
    onClose: PropTypes.func,
    onError: PropTypes.func,
}
