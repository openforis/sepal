import {Field, Label, form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState, SceneSelectionType} from '../../mosaicRecipe'
import {msg} from 'translate'
import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import Buttons from 'widget/buttons'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './scenes.module.css'

const fields = {
    type: new Field()
        .notEmpty('process.mosaic.panel.scenes.form.required'),

    targetDateWeight: new Field()
}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.sceneSelectionOptions')
    if (!values) {
        const model = recipeState('model.sceneSelectionOptions')
        values = modelToValues(model)
        RecipeActions(recipeId).setSceneSelectionOptions({values, model}).dispatch()
    }
    return {values}
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
                    icon='cog'
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

export default form({fields, mapStateToProps})(Scenes)

const valuesToModel = values => ({
    ...values
})

const modelToValues = model => ({
    ...model
})
