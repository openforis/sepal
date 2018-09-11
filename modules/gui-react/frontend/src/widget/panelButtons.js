import {Msg, msg} from 'translate'
import {PanelWizardContext} from './panel'
import {connect, select} from 'store'
import Icon from 'widget/icon'
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
        const renderButton = (button) =>
            <button
                type='button'
                key={button.key}
                onClick={(e) => {
                    e.preventDefault()
                    button.onClick(e)
                }}
                className={button.className || styles.default}>
                <span>{button.label}</span>
            </button>

        return (
            <div className={styles.additionalButtons}>
                {additionalButtons.map(renderButton)}
            </div>
        )
    }

    renderBackButton() {
        return (
            <button
                type='button'
                onClick={(e) => {
                    e.preventDefault()
                    this.back()
                }}
                onMouseDown={(e) => e.preventDefault()} // Prevent onBlur validation before going back
                className={styles.default}>
                <Icon name={'chevron-left'}/>
                <span><Msg id='button.back'/></span>
            </button>
        )
    }

    renderNextButton() {
        const {form} = this.props
        return (
            <button
                type='submit'
                onClick={(e) => {
                    e.preventDefault()
                    this.next()
                }}
                disabled={form.isInvalid()}
                className={styles.apply}>
                <span><Msg id='button.next'/></span>
                <Icon name={'chevron-right'}/>
            </button>
        )
    }

    renderDoneButton() {
        const {form} = this.props
        return (
            <button
                type='submit'
                onClick={(e) => {
                    e.preventDefault()
                    this.done()
                }}
                disabled={form.isInvalid()}
                className={styles.apply}>
                <Icon name={'check'}/>
                <span><Msg id='button.done'/></span>
            </button>
        )
    }

    renderWizardButtons() {
        const {first, last} = this.state
        return (
            <div>
                {!first ? this.renderBackButton() : null}
                {!last ? this.renderNextButton() : this.renderDoneButton()}
            </div>
        )
    }

    renderCancelButton() {
        const {isActionForm, cancelLabel = msg('button.cancel'), form} = this.props
        const dirty = form.isDirty()
        const showCancelButton = isActionForm || dirty
        return (
            <button
                type='button'
                onClick={(e) => {
                    e.preventDefault()
                    this.cancel()
                }}
                disabled={!showCancelButton}
                onMouseDown={(e) => e.preventDefault()} // Prevent onBlur validation before canceling
                className={styles.cancel}
                style={{opacity: showCancelButton ? 1 : 0}}>
                <Icon name={'undo-alt'}/>
                <span>{cancelLabel}</span>
            </button>
        )
    }

    renderOkButton() {
        const {applyLabel = msg('button.ok'), form} = this.props
        const dirty = form.isDirty()
        return (
            <button
                type='submit'
                onClick={(e) => {
                    e.preventDefault()
                    dirty ? this.ok() : this.cancel()
                }}
                disabled={form.isInvalid()}
                className={styles.apply}>
                <Icon name={'check'}/>
                <span>{applyLabel}</span>
            </button>
        )
    }

    renderFormButtons() {
        return (
            <div>
                {this.renderCancelButton()}
                {this.renderOkButton()}
            </div>
        )
    }
}

PanelButtons.propTypes = {
    initialized: PropTypes.any,
    modalOnDirty: PropTypes.any,
    isActionForm: PropTypes.any,
    applyLabel: PropTypes.string,
    cancelLabel: PropTypes.string,
    form: PropTypes.object.isRequired,
    statePath: PropTypes.string.isRequired,
    onCancel: PropTypes.func,
    onApply: PropTypes.func,
    additionalButtons: PropTypes.array
}

export default connect(mapStateToProps)(PanelButtons)
