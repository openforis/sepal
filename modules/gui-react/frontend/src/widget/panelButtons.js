import actionBuilder from 'action-builder'
import PropTypes from 'prop-types'
import React from 'react'
import {connect, select} from 'store'
import {msg, Msg} from 'translate'
import Icon from 'widget/icon'
import styles from 'widget/panelButtons.module.css'
import {PanelWizardContext} from './panel'


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
        return (<PanelWizardContext.Consumer>
                {panels => {
                    this.panels = panels || []
                    return (
                        <div className={styles.buttons}>
                            {this.renderAdditionalButtons()}
                            {initialized ? this.renderFormButtons() : this.renderWizardButtons()}
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

    renderWizardButtons() {
        const {form} = this.props
        const {first, last} = this.state
        const back =
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
        const next =
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

        const done =
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

        return (
            <div>
                {!first ? back : null}
                {!last ? next : done}
            </div>
        )
    }

    renderFormButtons() {
        const {isActionForm, applyLabel = msg('button.ok'), cancelLabel = msg('button.cancel'), form} = this.props
        const dirty = form.isDirty()
        return (
            <div>
                <button
                    type='button'
                    onClick={(e) => {
                        e.preventDefault()
                        this.cancel()
                    }}
                    disabled={!dirty && !isActionForm}
                    onMouseDown={(e) => e.preventDefault()} // Prevent onBlur validation before canceling
                    className={styles.cancel}
                    style={{opacity: isActionForm || dirty ? 1 : 0}}>
                    <Icon name={'undo-alt'}/>
                    <span>{cancelLabel}</span>
                </button>
                <button
                    type='submit'
                    onClick={(e) => {
                        e.preventDefault()
                        this.ok()
                    }}
                    disabled={form.isInvalid()}
                    className={styles.apply}>
                    <Icon name={'check'}/>
                    <span>{applyLabel}</span>
                </button>
            </div>
        )
    }
}

PanelButtons.propTypes = {
    form: PropTypes.object.isRequired,
    statePath: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(PanelButtons)