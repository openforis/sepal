import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, SceneSelectionType} from '../../mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import Buttons from 'widget/buttons'
import Label from 'widget/label'
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
            <div>
                <Label msg={msg('process.mosaic.panel.scenes.form.targetDateWeight.label')}/>
                <Buttons
                    input={targetDateWeight}
                    options={options}
                    unavailable={type.value !== SceneSelectionType.SELECT}/>
            </div>
        )
    }

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
                    <React.Fragment>
                        {this.renderTypes()}
                        {this.renderTargetDateWeight()}
                    </React.Fragment>
                </PanelContent>

                <FormPanelButtons/>
            </RecipeFormPanel>
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

const policy = ({values, wizardContext: {wizard}}) => {
    return wizard || selectFrom(values, 'dirty')
        ? {
            _: 'disallow',
            sceneSelection: 'allow'
        }
        : {
            _: 'allow-then-deactivate',
            sceneSelection: 'allow'
        }
}

export default recipeFormPanel({id: 'sceneSelectionOptions', fields, policy, mapRecipeToProps})(SceneSelectionOptions)
