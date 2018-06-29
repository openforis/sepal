import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import Buttons from 'widget/buttons'
import {Field, form, Label} from 'widget/form'
import {RecipeActions, RecipeState, SceneSelectionType} from '../../mosaicRecipe'
import PanelForm from '../panelForm'
import styles from './scenes.module.css'

const fields = {
    type: new Field()
        .notEmpty('process.mosaic.panel.scenes.form.required'),

    targetDateWeight: new Field()
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
            {
                value: SceneSelectionType.ALL,
                label: msg('process.mosaic.panel.scenes.form.type.all.label')
            },
            {
                value: SceneSelectionType.SELECT,
                label: msg('process.mosaic.panel.scenes.form.type.select.label')
            },
        ]
        return (
            <div className={styles.types}>
                <Label>
                    <Msg id='process.mosaic.panel.scenes.form.type.label'/>
                </Label>
                <Buttons
                    className={styles.sources}
                    input={type}
                    options={options}/>
            </div>
        )
    }

    renderTargetDateWeight() {
        const {inputs: {targetDateWeight}} = this.props
        const options = [
            {
                value: 0,
                label: msg('process.mosaic.panel.scenes.form.targetDateWeight.cloudFree.label'),
                tooltip: 'process.mosaic.panel.scenes.form.targetDateWeight.cloudFree'
            },
            {
                value: 0.5,
                label: msg('process.mosaic.panel.scenes.form.targetDateWeight.balanced.label'),
                tooltip: 'process.mosaic.panel.scenes.form.targetDateWeight.balanced'
            },
            {
                value: 1,
                label: msg('process.mosaic.panel.scenes.form.targetDateWeight.targetDate.label'),
                tooltip: 'process.mosaic.panel.scenes.form.targetDateWeight.targetDate'
            },
        ]
        return (
            <div>
                <Label>
                    <Msg id='process.mosaic.panel.scenes.form.targetDateWeight.label'/>
                </Label>

                <Buttons
                    input={targetDateWeight}
                    options={options}/>
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
                        {type.value === SceneSelectionType.SELECT ? this.renderTargetDateWeight() : null}
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
    fields: PropTypes.object,
    action: PropTypes.func,
    values: PropTypes.object
}

export default form({fields, mapStateToProps})(Scenes)
