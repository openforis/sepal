import {Form} from 'widget/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {SceneSelectionType} from 'app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './sceneSelectionOptions.module.css'

const fields = {
    type: new Form.Field()
        .notEmpty('process.mosaic.panel.scenes.form.required'),

    targetDateWeight: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    alwaysAll: Object.keys(selectFrom(recipe, 'model.sources.dataSets') || {}).length > 1
})

class _SceneSelectionOptions extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='images'
                    title={msg('process.mosaic.panel.scenes.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderTypes()}
                        {this.renderTargetDateWeight()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderTypes() {
        const {alwaysAll, inputs: {type}} = this.props
        const options = [{
            value: SceneSelectionType.ALL,
            label: msg('process.mosaic.panel.scenes.form.type.all.label')
        }, {
            value: SceneSelectionType.SELECT,
            label: msg('process.mosaic.panel.scenes.form.type.select.label'),
            neverSelected: alwaysAll
        }]
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.scenes.form.type.label')}
                className={styles.sources}
                input={type}
                options={options}/>
        )
    }

    renderTargetDateWeight() {
        const {inputs: {type, targetDateWeight}} = this.props
        const options = [{
            value: 0,
            label: msg('process.mosaic.panel.scenes.form.targetDateWeight.cloudFree.label')
        }, {
            value: 0.5,
            label: msg('process.mosaic.panel.scenes.form.targetDateWeight.balanced.label')
        }, {
            value: 1,
            label: msg('process.mosaic.panel.scenes.form.targetDateWeight.targetDate.label')
        }]
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.scenes.form.targetDateWeight.label')}
                input={targetDateWeight}
                options={options}
                disabled={type.value !== SceneSelectionType.SELECT}/>
        )
    }
}

const additionalPolicy = () => ({sceneSelection: 'allow'})

export const SceneSelectionOptions = compose(
    _SceneSelectionOptions,
    recipeFormPanel({id: 'sceneSelectionOptions', fields, additionalPolicy, mapRecipeToProps})
)

SceneSelectionOptions.propTypes = {
    recipeId: PropTypes.string
}
