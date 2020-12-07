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

    apply(onSuccess) {
        const {form, onApply} = this.props
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
        const {onDone} = this.props
        onDone && onDone()
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
                                        <Form onSubmit={() => onApply && onApply(form && form.values())}>
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
    isActionForm: PropTypes.any,
    placement: PropTypes.oneOf(['modal', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center', 'inline']),
    policy: PropTypes.func,
    type: PropTypes.string, // TODO: Same as type?
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
    onDone: PropTypes.func
}
