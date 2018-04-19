import React from 'react'
import {Msg} from 'translate'
import styles from './confirmationButtons.module.css'
import PropTypes from 'prop-types'
import Icon from 'widget/icon'

class ConfirmationButtons extends React.Component {
    componentDidMount() {
        const {form, recipe} = this.props
        form.onClean(() => recipe.setModal(false))
        form.onDirty(() => recipe.setModal(true))
        recipe.setModal(form.hasInvalid())
    }
    apply(e, values) {
        e.preventDefault()
        const {form, recipe} = this.props
        recipe.setAoi(values)
        form.setInitialValues(values)
    }
    revert(e) {
        e.preventDefault()
        const {form, recipe} = this.props
        form.reset()
        // TODO: remove this hack
        setTimeout(() => recipe.setModal(form.hasInvalid()), 0)
    }
    render () {
        const {form} = this.props
        const dirty = form.isDirty()
        return (
            <div className={[styles.buttons, dirty && styles.dirty].join(' ')}>
                <button onClick={(e) => this.apply.bind(this)(e, form.values())}
                    disabled={form.hasInvalid() || !dirty}>
                    <Icon name={'check'}/>
                    <span><Msg id='button.apply'/></span>
                </button>
                <button onClick={this.revert.bind(this)}
                    onMouseDown={(e) => e.preventDefault()} // Prevent onBlur validation before reverting
                    disabled={!dirty}>
                    <Icon name={'undo-alt'}/>
                    <span><Msg id='button.revert'/></span>
                </button>
            </div>
        )
    }
}

ConfirmationButtons.propTypes = {
    form: PropTypes.object,
    recipe: PropTypes.object
}

export default ConfirmationButtons
