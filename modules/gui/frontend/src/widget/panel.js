import {PanelButtonContext} from './toolbar'
import {PanelWizardContext} from './panelWizard'
import {connect, select} from 'store'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import styles from './panel.module.css'

const mapStateToProps = (state, ownProps) => {
    const {statePath} = ownProps
    return {
        initialized: select([statePath, 'initialized']),
        selectedPanel: select([statePath, 'selectedPanel'])
    }
}

class Panel extends React.Component {
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

    renderForm({form, onApply, top, bottom, left, right, center, inline, panelButtonPosition, className}, content) {
        const classNames = [
            styles.panel,
            top || (panelButtonPosition && panelButtonPosition.top) ? styles.top : null,
            bottom || (panelButtonPosition && panelButtonPosition.bottom) ? styles.bottom : null,
            right || (panelButtonPosition && panelButtonPosition.right) ? styles.right : null,
            left ? styles.bottom : null,
            center ? styles.center : null,
            inline || (panelButtonPosition && panelButtonPosition.inline) ? styles.inline : null,
            className
        ].join(' ')
        return form
            ? (
                <form
                    className={classNames}
                    onSubmit={e => {
                        e.preventDefault()
                        onApply && onApply(form && form.values())
                    }}>
                    {content}
                </form>
            )
            : (
                <div className={classNames}>{content}</div>
            )
    }

    renderModal({modal}, content) {
        return modal
            ? <div className={styles.modal}>{content}</div>
            : content
    }

    render() {
        const {form = false, isActionForm, initialized, onApply, top, bottom, left, right, center, inline, modal, className, children} = this.props
        const {selectedPanel} = this.props
        return (
            <PanelWizardContext.Consumer>
                {(panels = []) => {
                    console.log({panels, initialized})
                    const wizard = panels.length && !initialized
                    const selectedPanelIndex = panels.indexOf(selectedPanel)
                    const first = selectedPanelIndex === 0
                    const last = selectedPanelIndex === panels.length - 1
                    return (
                        <PanelButtonContext.Consumer>
                            {panelButtonPosition => (
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
                                    {this.renderModal({modal},
                                        this.renderForm({form, onApply, top, bottom, left, right, center, inline, panelButtonPosition, className}, children)
                                    )}
                                </PanelContext.Provider>
                            )}
                        </PanelButtonContext.Consumer>
                    )}}
            </PanelWizardContext.Consumer>
        )
    }
}

export default connect(mapStateToProps)(Panel)

Panel.propTypes = {
    children: PropTypes.any.isRequired,
    statePath: PropTypes.string.isRequired,
    bottom: PropTypes.any,
    center: PropTypes.any,
    className: PropTypes.string,
    form: PropTypes.object,
    initialized: PropTypes.any,
    inline: PropTypes.any,
    isActionForm: PropTypes.any,
    left: PropTypes.any,
    modal: PropTypes.any,
    modalOnDirty: PropTypes.any,
    right: PropTypes.any,
    top: PropTypes.any,
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
}

export const PanelHeader = ({icon, title, children}) =>
    <div className={styles.header}>
        {children
            ? children
            : <React.Fragment>
                <Icon name={icon}/>
                {title}
            </React.Fragment>
        }
    </div>

PanelHeader.propTypes = {
    children: PropTypes.any,
    icon: PropTypes.string,
    title: PropTypes.string,
}

export const PanelContent = ({className, children}) =>
    <div className={[styles.content, className].join(' ')}>
        {children}
    </div>

PanelContent.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
}

export const PanelContext = React.createContext()
