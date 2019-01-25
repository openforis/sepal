import {Field, form} from 'widget/form'
import {RecipeActions, RecipeState, SceneSelectionType} from '../../mosaicRecipe'
import {initValues} from 'app/home/body/process/recipe'
import {msg} from 'translate'
import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import Buttons from 'widget/buttons'
import Label from 'widget/label'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './scenes.module.css'

const fields = {
    type: new Field()
        .notEmpty('process.mosaic.panel.scenes.form.required'),

    targetDateWeight: new Field()
}

class Scenes extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
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
                <Label msg={msg('process.mosaic.panel.scenes.form.type.label')}/>
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
                // tooltip: msg('process.mosaic.panel.scenes.form.targetDateWeight.cloudFree.tooltip')
            },
            {
                value: 0.5,
                label: msg('process.mosaic.panel.scenes.form.targetDateWeight.balanced.label'),
                // tooltip: msg('process.mosaic.panel.scenes.form.targetDateWeight.balanced.tooltip')
            },
            {
                value: 1,
                label: msg('process.mosaic.panel.scenes.form.targetDateWeight.targetDate.label'),
                // tooltip: msg('process.mosaic.panel.scenes.form.targetDateWeight.targetDate.tooltip')
            },
        ]
        return (
            <div>
                <Label msg={msg('process.mosaic.panel.scenes.form.targetDateWeight.label')}/>
                <Buttons
                    input={targetDateWeight}
                    options={options}/>
            </div>
        )
    }

    render() {
        const {recipeId, form, inputs: {type}} = this.props
        return (
            <Panel
                className={styles.panel}
                form={form}
                statePath={recipePath(recipeId, 'ui')}
                onApply={values => this.recipeActions.setSceneSelectionOptions({
                    values,
                    model: valuesToModel(values)
                }).dispatch()}>
                <PanelHeader
                    icon='images'
                    title={msg('process.mosaic.panel.scenes.title')}/>

                <PanelContent>
                    <div>
                        {this.renderTypes()}
                        {type.value === SceneSelectionType.SELECT ? this.renderTargetDateWeight() : null}
                    </div>
                </PanelContent>

                <PanelButtons/>
            </Panel>
        )
    }
}

Scenes.propTypes = {
    recipeId: PropTypes.string
}

const valuesToModel = values => ({
    ...values
})

const modelToValues = model => ({
    ...model
})

export default initValues({
    getModel: props => RecipeState(props.recipeId)('model.sceneSelectionOptions'),
    getValues: props => RecipeState(props.recipeId)('ui.sceneSelectionOptions'),
    modelToValues,
    onInitialized: ({model, values, props}) =>
        RecipeActions(props.recipeId)
            .setSceneSelectionOptions({values, model})
            .dispatch()
})(
    form({fields})(Scenes)
)
