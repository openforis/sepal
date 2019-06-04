import {FormButtons as Buttons} from 'widget/buttons'
import {Field} from 'widget/form'
import {FieldSet, PanelContent, PanelHeader} from 'widget/panel'
import {FormPanelButtons} from 'widget/formPanel'
import {RecipeActions, SceneSelectionType} from '../../mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './sceneSelectionOptions.module.css'

const fields = {
    type: new Field()
        .notEmpty('process.mosaic.panel.scenes.form.required'),

    targetDateWeight: new Field()
}

const mapRecipeToProps = recipe => ({
    alwaysAll: Object.keys(selectFrom(recipe, 'model.sources') || {}).length > 1
})

class SceneSelectionOptions extends React.Component {
    render() {
        const {recipeId} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'
                onClose={() => RecipeActions(recipeId).showPreview().dispatch()}>
                <PanelHeader
                    icon='images'
                    title={msg('process.mosaic.panel.scenes.title')}/>
                <PanelContent>
                    <FieldSet>
                        {this.renderTypes()}
                        {this.renderTargetDateWeight()}
                    </FieldSet>
                </PanelContent>
                <FormPanelButtons/>
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
            <Buttons
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
            <Buttons
                label={msg('process.mosaic.panel.scenes.form.targetDateWeight.label')}
                input={targetDateWeight}
                options={options}
                disabled={type.value !== SceneSelectionType.SELECT}/>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }
}

SceneSelectionOptions.propTypes = {
    recipeId: PropTypes.string
}

const additionalPolicy = () => ({sceneSelection: 'allow'})

export default compose(
    SceneSelectionOptions,
    recipeFormPanel({id: 'sceneSelectionOptions', fields, additionalPolicy, mapRecipeToProps})
)
