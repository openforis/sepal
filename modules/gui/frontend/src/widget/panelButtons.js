import {Button, ButtonGroup} from 'widget/button'
import {PanelWizardContext} from './panel'
import {connect, select} from 'store'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import styles from 'widget/panelButtons.module.css'

const mapStateToProps = (state, ownProps) => {
    const {statePath} = ownProps
    return {
        initialized: select([statePath, 'initialized']),
        selectedPanel: select([statePath, 'selectedPanel'])
    }
}

class PanelButtons extends React.Component {
    state = {
        selectedPanelIndex: 0,
        first: true,
        last: false,
        panels: []
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const {selectedPanel} = nextProps
        const panels = prevState.panels
        const selectedPanelIndex = panels.indexOf(selectedPanel)
        const first = selectedPanelIndex === 0
        const last = selectedPanelIndex === panels.length - 1
        return {...prevState, selectedPanelIndex, first, last}

    }

    apply() {
        const {form, onApply} = this.props
        onApply(form.values())
    }

    closePanel() {
        this.setModal(false)
        this.selectPanel()
    }

    ok() {
        this.apply()
        this.closePanel()
    }

    cancel() {
        const {onCancel} = this.props
        this.closePanel()
        onCancel && onCancel()
    }

    back() {
        const {selectedPanelIndex, first} = this.state
        if (!first) {
            this.apply()
            this.selectPanel(this.state.panels[selectedPanelIndex - 1])
        }
    }

    next() {
        const {selectedPanelIndex, last} = this.state
        if (!last) {
            this.apply()
            this.selectPanel(this.state.panels[selectedPanelIndex + 1])
        }
    }

    done() {
        this.apply()
        this.setInitialized()
        this.closePanel()
    }

    render() {
        const {initialized} = this.props
        return (
            <PanelWizardContext.Consumer>
                {panels => {
                    this.panels = panels || []
                    return (
                        <div className={styles.buttons}>
                            {this.renderAdditionalButtons()}
                            {!panels || initialized ? this.renderFormButtons() : this.renderWizardButtons()}
                        </div>
                    )
                }}
            </PanelWizardContext.Consumer>
        )
    }

    componentDidMount() {
        const {initialized, form, modalOnDirty = true} = this.props
        if (modalOnDirty) {
            this.setModal(!initialized)
            if (initialized) {
                form.onDirty(() => this.setModal(true))
                form.onClean(() => this.setModal(false))
            }
        }
        this.setState(prevState => ({...prevState, panels: this.panels}))
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

    renderAdditionalButtons() {
        const {additionalButtons = []} = this.props
        const renderButton = ({key, look, label, disabled, tooltip, onClick}) =>
            <Button
                key={key}
                look={look}
                label={label}
                disabled={disabled}
                onClick={(e) => {
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

    renderBackButton() {
        return (
            <Button
                icon='chevron-left'
                label={msg('button.back')}
                onClick={e => {
                    e.preventDefault()
                    this.back()
                }}
                onMouseDown={e => e.preventDefault()} // Prevent onBlur validation before going back
            />
        )
    }

    renderNextButton() {
        const {form} = this.props
        return (
            <Button
                type='submit'
                look='apply'
                icon='chevron-right'
                label={msg('button.next')}
                disabled={form.isInvalid()}
                onClick={e => {
                    e.preventDefault()
                    this.next()
                }}
            />
        )
    }

    renderDoneButton() {
        const {form} = this.props
        return (
            <Button
                type='submit'
                look='apply'
                icon='check'
                label={msg('button.done')}
                disabled={form.isInvalid()}
                onClick={e => {
                    e.preventDefault()
                    this.done()
                }}
            />
        )
    }

    renderWizardButtons() {
        const {first, last} = this.state
        return (
            <ButtonGroup>
                {!first ? this.renderBackButton() : null}
                {!last ? this.renderNextButton() : this.renderDoneButton()}
            </ButtonGroup>
        )
    }

    renderCancelButton() {
        const {isActionForm, cancelLabel = msg('button.cancel'), form} = this.props
        const dirty = form.isDirty()
        const showCancelButton = isActionForm || dirty
        return (
            <Button
                look='cancel'
                icon='undo-alt'
                label={cancelLabel}
                shown={showCancelButton}
                disabled={!showCancelButton}
                onClick={e => {
                    e.preventDefault()
                    this.cancel()
                }}
                onMouseDown={e => e.preventDefault()} // Prevent onBlur validation before canceling
            />
        )
    }

    renderOkButton() {
        const {isActionForm, applyLabel = msg('button.ok'), form} = this.props
        const dirty = form.isDirty()
        return (
            <Button
                type='submit'
                look='apply'
                icon='check'
                label={applyLabel}
                disabled={form.isInvalid()}
                onClick={e => {
                    e.preventDefault()
                    dirty || isActionForm ? this.ok() : this.cancel()
                }}
                onMouseDown={e => e.preventDefault()} // Prevent onBlur validation before canceling
            />
        )
    }

    renderFormButtons() {
        return (
            <ButtonGroup>
                {this.renderCancelButton()}
                {this.renderOkButton()}
            </ButtonGroup>
        )
    }
}

PanelButtons.propTypes = {
    form: PropTypes.object.isRequired,
    statePath: PropTypes.string.isRequired,
    additionalButtons: PropTypes.arrayOf(
        PropTypes.shape({
            key: PropTypes.string.isRequired,
            label: PropTypes.string.isRequired,
            onClick: PropTypes.func.isRequired,
            disabled: PropTypes.any,
        })
    ),
    applyLabel: PropTypes.string,
    cancelLabel: PropTypes.string,
    initialized: PropTypes.any,
    isActionForm: PropTypes.any,
    modalOnDirty: PropTypes.any,
    onApply: PropTypes.func,
    onCancel: PropTypes.func
}

export default connect(mapStateToProps)(PanelButtons)
