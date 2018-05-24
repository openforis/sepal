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
        this.recipe.setModal(true).dispatch()
    }

    apply() {
        const {form, onApply} = this.props
        const values = form.values()
        onApply(this.recipe, values)
    }

    closePanel() {
        this.recipe.setModal(false).dispatch()
        this.recipe.selectPanel().dispatch()
    }

    ok() {
        this.apply()
        this.closePanel()
    }

    cancel() {
        this.closePanel()
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
        this.closePanel()
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
                <Icon name={'chevron-left'}/>
                <span><Msg id='button.back'/></span>
            </button>
        const next =
            <button
                onClick={(e) => {
                    e.preventDefault()
                    this.next()
                }}
                disabled={form.hasInvalid()}
                className={styles.apply}>
                <span><Msg id='button.next'/></span>
                <Icon name={'chevron-right'}/>
            </button>

        const done =
            <button
                onClick={(e) => {
                    e.preventDefault()
                    this.done()
                }}
                disabled={form.hasInvalid()}
                className={styles.apply}>
                <Icon name={'check'}/>
                <span><Msg id='button.done'/></span>
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
        return (
            <div className={styles.buttons}>
                <button
                    onClick={(e) => {
                        e.preventDefault()
                        this.cancel()
                    }}
                    onMouseDown={(e) => e.preventDefault()} // Prevent onBlur validation before canceling
                    className={styles.cancel}>
                    <Icon name={'undo-alt'}/>
                    <span><Msg id='button.cancel'/></span>
                </button>
                <button
                    onClick={(e) => {
                        e.preventDefault()
                        this.ok()
                    }}
                    disabled={form.hasInvalid()}
                    className={styles.apply}>
                    <Icon name={'check'}/>
                    <span><Msg id='button.ok'/></span>
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
