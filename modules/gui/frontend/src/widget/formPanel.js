import {Form} from 'widget/form'
import {Panel} from 'widget/panel'
import {PanelButtonContext} from './toolbar'
import {PanelButtons} from 'widget/panel'
import {PanelWizardContext} from './panelWizard'
import {connect, select} from 'store'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'

const mapStateToProps = (state, ownProps) => {
    const {statePath} = ownProps
    return {
        initialized: select([statePath, 'initialized']),
        selectedPanel: select([statePath, 'selectedPanel'])
    }
}

const PanelContext = React.createContext()

class FormPanel extends React.Component {
    componentDidMount() {
        const {initialized, form, modalOnDirty = true} = this.props
        if (modalOnDirty) {
            this.setModal(!initialized)
            if (initialized) {
                form.onDirty(() => this.setModal(true))
                form.onClean(() => this.setModal(false))
            }
        }
    }

    setModal(modal) {
        const {statePath} = this.props
        actionBuilder('SET_MODAL', {modal})
            .set([statePath, 'modal'], modal)
            .dispatch()
    }

    selectPanel(panel) {
        const {statePath} = this.props
        actionBuilder('SELECT_PANEL', {panel})
            .set([statePath, 'selectedPanel'], panel)
            .dispatch()
    }

    setInitialized() {
        const {statePath} = this.props
        actionBuilder('SET_INITIALIZED')
            .set([statePath, 'initialized'], true)
            .dispatch()
    }

    closePanel() {
        this.setModal(false)
        this.selectPanel()
    }

    apply() {
        const {form, onApply} = this.props
        onApply(form && form.values())
    }

    ok() {
        const {form, isActionForm} = this.props
        if (form && (isActionForm || form.isDirty())) {
            this.apply()
            this.closePanel()
        } else {
            this.cancel()
        }
    }

    cancel() {
        const {onCancel} = this.props
        onCancel && onCancel()
        this.closePanel()
    }

    back(panel) {
        this.apply()
        this.selectPanel(panel)
    }

    next(panel) {
        this.apply()
        this.selectPanel(panel)
    }

    done() {
        this.apply()
        this.setInitialized()
        this.closePanel()
    }

    render() {
        const {form = false, isActionForm, initialized, onApply, type = 'modal', className, children} = this.props
        const {selectedPanel} = this.props
        return (
            <PanelWizardContext.Consumer>
                {(panels = []) => {
                    const wizard = panels.length && !initialized
                    const selectedPanelIndex = panels.indexOf(selectedPanel)
                    const first = selectedPanelIndex === 0
                    const last = selectedPanelIndex === panels.length - 1
                    return (
                        <PanelButtonContext.Consumer>
                            {placement => (
                                <PanelContext.Provider value={{
                                    wizard,
                                    first,
                                    last,
                                    isActionForm: form && isActionForm,
                                    dirty: form && form.isDirty(),
                                    invalid: form && form.isInvalid(),
                                    onOk: () => this.ok(),
                                    onCancel: () => this.cancel(),
                                    onBack: () => !first && this.back(panels[selectedPanelIndex - 1]),
                                    onNext: () => !last && this.next(panels[selectedPanelIndex + 1]),
                                    onDone: () => this.done()
                                }}>
                                    <Panel className={className} type={placement || type}>
                                        <Form onSubmit={() => onApply && onApply(form && form.values())}>
                                            {children}
                                        </Form>
                                    </Panel>
                                </PanelContext.Provider>
                            )}
                        </PanelButtonContext.Consumer>
                    )}}
            </PanelWizardContext.Consumer>
        )
    }
}

export default connect(mapStateToProps)(FormPanel)

FormPanel.propTypes = {
    children: PropTypes.any.isRequired,
    form: PropTypes.object.isRequired,
    statePath: PropTypes.string.isRequired,
    className: PropTypes.string,
    initialized: PropTypes.any,
    isActionForm: PropTypes.any,
    modalOnDirty: PropTypes.any,
    type: PropTypes.string,
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
}

export class FormPanelButtons extends React.Component {
    renderBackButton(onClick) {
        return PanelButtons.renderButton({template: 'back', onClick})
    }

    renderNextButton({invalid}, onClick) {
        return PanelButtons.renderButton({template: 'next', disabled: invalid, onClick})
    }

    renderDoneButton({invalid}, onClick) {
        return PanelButtons.renderButton({template: 'done', disabled: invalid, onClick})
    }

    renderCancelButton({isActionForm, dirty}, onClick) {
        const {label} = this.props
        const shown = isActionForm || dirty
        return PanelButtons.renderButton({template: 'cancel', label, shown, onClick})
    }

    renderCloseButton(onClick) {
        const {label} = this.props
        return PanelButtons.renderButton({template: 'close', label, onClick})
    }

    renderApplyButton({isActionForm, invalid}, onClick) {
        const {label} = this.props
        const type = isActionForm ? 'button' : 'submit'
        const disabled = !isActionForm && invalid
        return PanelButtons.renderButton({template: 'apply', type, label, disabled, onClick})
    }

    renderWizardButtons({invalid, first, last, onBack, onNext, onDone}) {
        return (
            <PanelButtons.Main>
                {!first ? this.renderBackButton(onBack) : null}
                {!last ? this.renderNextButton({invalid}, onNext) : this.renderDoneButton({invalid}, onDone)}
            </PanelButtons.Main>
        )
    }

    renderFormButtons({isActionForm, dirty, invalid, onOk, onCancel}) {
        return (
            <PanelButtons.Main>
                {this.renderCancelButton({isActionForm, dirty}, onCancel)}
                {this.renderApplyButton({isActionForm, invalid}, onOk)}
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
    cancelLabel: PropTypes.string,
    children: PropTypes.any
}
