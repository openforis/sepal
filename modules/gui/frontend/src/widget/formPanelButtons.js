import {Button, ButtonGroup} from 'widget/button'
import {PanelButtons} from 'widget/panel'
import {PanelContext} from './formPanel'
import PropTypes from 'prop-types'
import React from 'react'
import styles from 'widget/formPanelButtons.module.css'

export default class FormPanelButtons extends React.Component {
    renderAdditionalButtons() {
        const {additionalButtons = []} = this.props
        const renderButton = ({key, look, icon, label, disabled, tooltip, onClick}) =>
            <Button
                key={key}
                look={look}
                icon={icon}
                label={label}
                disabled={disabled}
                onClick={e => {
                    e.preventDefault()
                    onClick(e)
                }}
                tooltip={tooltip}
                tooltipPlacement='bottom'
                tooltipDisabled={!tooltip || disabled}
            />
        return (
            <ButtonGroup>
                {additionalButtons.map(renderButton)}
            </ButtonGroup>
        )
    }

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
            <ButtonGroup>
                {!first ? this.renderBackButton(onBack) : null}
                {!last ? this.renderNextButton({invalid}, onNext) : this.renderDoneButton({invalid}, onDone)}
            </ButtonGroup>
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
            <ButtonGroup>
                {this.renderCancelButton({isActionForm, dirty}, onCancel)}
                {this.renderApplyButton({isActionForm, invalid}, onOk)}
            </ButtonGroup>
        )
    }

    render() {
        return (
            <PanelContext.Consumer>
                {({isActionForm, wizard, first, last, dirty, invalid, onOk, onCancel, onBack, onNext, onDone}) => (
                    <div className={styles.buttons}>
                        {this.renderAdditionalButtons()}
                        {wizard
                            ? this.renderWizardButtons({first, last, invalid, onBack, onNext, onDone})
                            : this.renderFormButtons({isActionForm, dirty, invalid, onOk, onCancel})}
                    </div>
                )}
            </PanelContext.Consumer>
        )
    }
}

FormPanelButtons.propTypes = {
    additionalButtons: PropTypes.arrayOf(
        PropTypes.shape({
            key: PropTypes.string.isRequired,
            label: PropTypes.string.isRequired,
            onClick: PropTypes.func.isRequired,
            disabled: PropTypes.any,
            icon: PropTypes.string
        })
    ),
    applyLabel: PropTypes.string,
    cancelLabel: PropTypes.string
}
