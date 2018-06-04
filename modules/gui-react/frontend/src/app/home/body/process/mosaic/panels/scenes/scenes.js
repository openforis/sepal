import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import Buttons from 'widget/buttons'
import {Constraints, form} from 'widget/form'
import Slider from 'widget/slider'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import PanelForm from '../panelForm'
import styles from './scenes.module.css'

const inputs = {
    type: new Constraints()
        .notEmpty('process.mosaic.panel.scenes.form.required'),

    targetDateWeight: new Constraints()
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        values: recipe('ui.sceneSelectionOptions')
    }
}

class Scenes extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    renderTypes() {
        const {inputs: {type}} = this.props
        const options = [
            {value: 'all', label: msg('process.mosaic.panel.scenes.form.type.all')},
            {value: 'select', label: msg('process.mosaic.panel.scenes.form.type.select')},
        ]
        return (
            <div className={styles.types}>
                <label><Msg id='process.mosaic.panel.scenes.form.type.label'/></label>
                <Buttons
                    className={styles.sources}
                    input={type}
                    options={options}/>
            </div>
        )
    }

    renderTargetDateWeight() {
        const {inputs: {targetDateWeight}} = this.props
        return (
            <div>
                <label><Msg id='process.mosaic.panel.scenes.form.targetDateWeight.label'/></label>
                <Slider
                    startValue={targetDateWeight.value || 0}
                    minValue={0}
                    maxValue={100}
                    onChange={targetDateWeight.set}/>
            </div>
        )
    }

    render() {
        const {recipeId, form, inputs: {type}, className} = this.props
        return (
            <form className={[className, styles.container].join(' ')}>
                <PanelForm
                    recipeId={recipeId}
                    form={form}
                    onApply={(recipe, sources) => recipe.setSceneSelectionOptions(sources).dispatch()}
                    icon='cog'
                    title={msg('process.mosaic.panel.scenes.title')}>
                    <div className={styles.form}>
                        {this.renderTypes()}
                        {type.value === 'select' ? this.renderTargetDateWeight() : null}
                    </div>
                </PanelForm>
            </form>
        )
    }
}

Scenes.propTypes = {
    recipeId: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({}),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Scenes)
