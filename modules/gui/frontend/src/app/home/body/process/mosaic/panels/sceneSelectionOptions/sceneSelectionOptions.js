import {selectFrom} from 'collections'
import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {RecipeActions, SceneSelectionType} from '../../mosaicRecipe'
import {msg} from 'translate'
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

class SceneSelectionOptions extends React.Component {
    renderTypes() {
        const {inputs: {type}} = this.props
        const options = [{
            value: SceneSelectionType.ALL,
            label: msg('process.mosaic.panel.scenes.form.type.all.label')
        }, {
            value: SceneSelectionType.SELECT,
            label: msg('process.mosaic.panel.scenes.form.type.select.label')
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
        const {inputs: {targetDateWeight}} = this.props
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
                    options={options}/>
            </div>
        )
    }

    render() {
        const {inputs: {type}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <PanelHeader
                    icon='images'
                    title={msg('process.mosaic.panel.scenes.title')}/>

                <PanelContent>
                    <div>
                        {this.renderTypes()}
                        {type.value === SceneSelectionType.SELECT ? this.renderTargetDateWeight() : null}
                    </div>
                </PanelContent>

                <FormPanelButtons/>
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }

    componentWillUnmount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).showPreview().dispatch()
    }
}

SceneSelectionOptions.propTypes = {
    recipeId: PropTypes.string
}

const policy = ({values, wizardContext: {wizard}}) => {
    return wizard || selectFrom(values, 'dirty')
        ? {compatibleWith: {include: ['sceneSelection']}}
        : {
            compatibleWith: {exclude: []},
            deactivateWhen: {exclude: ['sceneSelection']}
        }
}

export default recipeFormPanel({id: 'sceneSelectionOptions', fields, policy})(SceneSelectionOptions)
