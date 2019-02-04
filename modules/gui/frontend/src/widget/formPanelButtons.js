import {PanelButtons} from 'widget/panel'
import {PanelContext} from './formPanel'
import PropTypes from 'prop-types'
import React from 'react'

export default class FormPanelButtons extends React.Component {
    renderBackButton(onClick) {
        return PanelButtons.renderButton({template: 'back', onClick})
    }

    renderNextButton({invalid}, onClick) {
        return PanelButtons.renderButton({template: 'next', disabled: invalid, onClick})
    }

    renderDoneButton({invalid}, onClick) {
        return PanelButtons.renderButton({template: 'done', disabled: invalid, onClick})
    }

    renderWizardButtons({invalid, first, last, onBack, onNext, onDone}) {
        return (
            <React.Fragment>
                {!first ? this.renderBackButton(onBack) : null}
                {!last ? this.renderNextButton({invalid}, onNext) : this.renderDoneButton({invalid}, onDone)}
            </React.Fragment>
        )
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

    renderFormButtons({isActionForm, dirty, invalid, onOk, onCancel}) {
        return (
            <React.Fragment>
                {this.renderCancelButton({isActionForm, dirty}, onCancel)}
                {this.renderApplyButton({isActionForm, invalid}, onOk)}
            </React.Fragment>
        )
    }

    renderMainButtons({isActionForm, wizard, first, last, dirty, invalid, onOk, onCancel, onBack, onNext, onDone}) {
        return (
            <PanelButtons.Main>
                {wizard
                    ? this.renderWizardButtons({first, last, invalid, onBack, onNext, onDone})
                    : this.renderFormButtons({isActionForm, dirty, invalid, onOk, onCancel})}
            </PanelButtons.Main>
        )
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
