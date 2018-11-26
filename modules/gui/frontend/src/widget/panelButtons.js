import {Button, ButtonGroup} from 'widget/button'
import {PanelContext} from './panel'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from 'widget/panelButtons.module.css'

export default class PanelButtons extends React.Component {
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
        return (
            <Button
                icon='chevron-left'
                label={msg('button.back')}
                onClick={e => {
                    e.preventDefault()
                    onClick && onClick()
                }}
                onMouseDown={e => e.preventDefault()} // Prevent onBlur validation before going back
            />
        )
    }

    renderNextButton({invalid}, onClick) {
        return (
            <Button
                type='submit'
                look='apply'
                icon='chevron-right'
                label={msg('button.next')}
                disabled={invalid}
                onClick={e => {
                    e.preventDefault()
                    onClick && onClick()
                }}
            />
        )
    }

    renderDoneButton({invalid}, onClick) {
        return (
            <Button
                type='submit'
                look='apply'
                icon='check'
                label={msg('button.done')}
                disabled={invalid}
                onClick={e => {
                    e.preventDefault()
                    onClick && onClick()
                }}
            />
        )
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
        const {cancelLabel = msg('button.cancel')} = this.props
        const showCancelButton = isActionForm || dirty
        return (
            <Button
                type='cancel'
                look='cancel'
                icon='undo-alt'
                label={cancelLabel}
                shown={showCancelButton}
                disabled={!showCancelButton}
                onClick={e => {
                    e.preventDefault()
                    onClick && onClick()
                }}
                onMouseDown={e => e.preventDefault()} // Prevent onBlur validation before canceling
            />
        )
    }

    renderOkButton({isActionForm, invalid}, onClick) {
        const {applyLabel = msg('button.ok')} = this.props
        return (
            <Button
                type={isActionForm ? 'button' : 'submit'}
                look='apply'
                icon='check'
                label={applyLabel}
                disabled={!isActionForm && invalid}
                onClick={e => {
                    e.preventDefault()
                    onClick && onClick()
                }}
                onMouseDown={e => e.preventDefault()} // Prevent onBlur validation before canceling
            />
        )
    }

    renderFormButtons({isActionForm, dirty, invalid, onOk, onCancel}) {
        return (
            <ButtonGroup>
                {this.renderCancelButton({isActionForm, dirty}, onCancel)}
                {this.renderOkButton({isActionForm, invalid}, onOk)}
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

PanelButtons.propTypes = {
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
