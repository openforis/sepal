import PropTypes from 'prop-types'
import React from 'react'
import {Msg} from 'translate'
import Icon from 'widget/icon'
import {RecipeActions} from '../mosaicRecipe'
import styles from './panelButtons.module.css'
import {connect} from 'store'
import {RecipeState} from '../mosaicRecipe'
import {PANELS} from './panelConstants'

const WIZARD_PANELS = [PANELS.AREA_OF_INTEREST, PANELS.DATES, PANELS.SOURCES]

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        initialized: recipe('initialized'),
        selectedPanel: recipe('ui.selectedPanel')
    }
}

class PanelButtons extends React.Component {
    state = {
        selectedPanelIndex: 0,
        first: true,
        last: false
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const {selectedPanel} = nextProps
        const selectedPanelIndex = WIZARD_PANELS.indexOf(selectedPanel)
        const first = selectedPanelIndex === 0
        const last = selectedPanelIndex === WIZARD_PANELS.length - 1
        return {...prevState, selectedPanelIndex, first, last}

    }
    componentDidMount() {
        const {recipeId, form} = this.props
        this.recipe = RecipeActions(recipeId)
        form.onClean(() => this.recipe.setModal(form.hasInvalid()).dispatch())
        form.onDirty(() => this.recipe.setModal(true).dispatch())
        this.recipe.setModal(form.hasInvalid()).dispatch()
    }

    apply() {
        const {form, onApply} = this.props
        const values = form.values()
        onApply(this.recipe, values)
        form.setInitialValues(values)
    }

    revert() {
        const {form} = this.props
        form.reset()
    }

    back() {
        const {selectedPanelIndex, first} = this.state
        if (!first) {
            this.apply()
            this.recipe.selectPanel(WIZARD_PANELS[selectedPanelIndex - 1])
                .dispatch()
        }
    }

    next() {
        const {form} = this.props
        const {selectedPanelIndex, last} = this.state
        if (!last) {
            this.apply()
            this.recipe.selectPanel(WIZARD_PANELS[selectedPanelIndex + 1])
                .dispatch()
        }
    }

    done() {
        this.apply()
        this.recipe.setInitialized().dispatch()
        this.recipe.setModal(false).dispatch()
        this.recipe.selectPanel().dispatch()
    }

    render() {
        const {initialized} = this.props
        return initialized ? this.renderFormButtons() : this.renderWizardButtons()
    }

    renderWizardButtons() {
        const {form} = this.props
        const {first, last} = this.state
        const back =
            <button
                onClick={(e) => {
                    e.preventDefault()
                    this.back()
                }}
                onMouseDown={(e) => e.preventDefault()} // Prevent onBlur validation before going back
                className={styles.back}>
                <span>Back</span>
            </button>
        const next =
            <button
                onClick={(e) => {
                    e.preventDefault()
                    this.next()
                }}
                disabled={form.hasInvalid()}
                className={styles.apply}>
                <span>Next</span>
            </button>

        const done =
            <button
                onClick={(e) => {
                    e.preventDefault()
                    this.done()
                }}
                disabled={form.hasInvalid()}
                className={styles.apply}>
                <span>Done</span>
            </button>

        return (
            <div className={styles.buttons}>
                {!first ? back : null}
                {!last ? next : done}
            </div>
        )
    }

    renderFormButtons() {
        const {form} = this.props
        const dirty = form.isDirty()
        return (
            <div className={[styles.buttons, styles.formButtons, dirty && styles.dirty].join(' ')}>
                <button
                    onClick={(e) => {
                        e.preventDefault()
                        this.revert()
                    }}
                    onMouseDown={(e) => e.preventDefault()} // Prevent onBlur validation before reverting
                    disabled={!dirty}
                    className={styles.revert}>
                    <Icon name={'undo-alt'}/>
                    <span><Msg id='button.revert'/></span>
                </button>
                <button
                    onClick={(e) => {
                        e.preventDefault()
                        this.apply()
                    }}
                    disabled={form.hasInvalid() || !dirty}
                    className={styles.apply}>
                    <Icon name={'check'}/>
                    <span><Msg id='button.apply'/></span>
                </button>
            </div>
        )
    }
}

PanelButtons.propTypes = {
    recipeId: PropTypes.string.isRequired,
    form: PropTypes.object.isRequired,
    onApply: PropTypes.func.isRequired
}

export default connect(mapStateToProps)(PanelButtons)
