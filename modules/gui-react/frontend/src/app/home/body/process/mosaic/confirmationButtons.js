import React from 'react'
import {Msg} from 'translate'
import styles from './confirmationButtons.module.css'
import PropTypes from 'prop-types'
import Icon from 'widget/icon'

class ConfirmationButtons extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            dirty: false
        }
        props.form.onClean(this.onClean.bind(this))
        props.form.onDirty(this.onDirty.bind(this))
    }
    onClean() {
        this.setState({
            ...this.state,
            dirty: false
        })
        this.props.recipe.setPanelsEnabled()
    }
    onDirty() {
        this.setState({
            ...this.state,
            dirty: true
        })
        this.props.recipe.setPanelsDisabled()
    }
    apply(e, values) {
        e.preventDefault()
        this.props.recipe.setAoi(values)
        this.props.form.setInitialValues(values)
    }
    revert(e) {
        e.preventDefault()
        this.props.form.reset()
    }

    render () {
        const {form} = this.props
        const dirty = this.state.dirty
        return (
            <div className={[styles.buttons, dirty && styles.dirty].join(' ')}>
                <button onClick={(e) => this.apply.bind(this)(e, form.values())}
                    disabled={form.hasInvalid() || !dirty}>
                    <Icon name={'check'}/>
                    <span><Msg id='button.apply'/></span>
                </button>
                <button onClick={this.revert.bind(this)}
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
