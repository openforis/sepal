import PropTypes from 'prop-types'
import React from 'react'
import {Msg} from 'translate'
import Icon from 'widget/icon'
import {RecipeActions} from '../mosaicRecipe'
import styles from './confirmationButtons.module.css'

class ConfirmationButtons extends React.Component {
    componentDidMount() {
        const {recipeId, form} = this.props
        this.recipe = RecipeActions(recipeId)
        form.onClean(() => this.recipe.setModal(form.hasInvalid()).dispatch())
        form.onDirty(() => this.recipe.setModal(true).dispatch())
        this.recipe.setModal(form.hasInvalid()).dispatch()
    }

    apply(e, values) {
        e.preventDefault()
        const {form, onApply} = this.props
        onApply(this.recipe, values)
        form.setInitialValues(values)
    }

    revert(e) {
        e.preventDefault()
        const {form} = this.props
        form.reset()
    }

    render() {
        const {form} = this.props
        const dirty = form.isDirty()
        return (
            <div className={[styles.buttons, dirty && styles.dirty].join(' ')}>
                <button
                    onClick={(e) => this.apply.bind(this)(e, form.values())}
                    disabled={form.hasInvalid() || !dirty}
                    className={styles.apply}>
                    <Icon name={'check'}/>
                    <span><Msg id='button.apply'/></span>
                </button>
                <button
                    onClick={this.revert.bind(this)}
                    onMouseDown={(e) => e.preventDefault()} // Prevent onBlur validation before reverting
                    disabled={!dirty}
                    className={styles.revert}>
                    <Icon name={'undo-alt'}/>
                    <span><Msg id='button.revert'/></span>
                </button>
            </div>
        )
    }
}

ConfirmationButtons.propTypes = {
    recipeId: PropTypes.string.isRequired,
    form: PropTypes.object.isRequired,
    onApply: PropTypes.func.isRequired
}

export default ConfirmationButtons
