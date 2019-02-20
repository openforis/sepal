import {recipeFormPanel, RecipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import Buttons from 'widget/buttons'
import {Field, form} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import Label from 'widget/label'
import {PanelContent, PanelHeader} from 'widget/panel'
import {SceneSelectionType} from '../../mosaicRecipe'
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
}

SceneSelectionOptions.propTypes = {
    recipeId: PropTypes.string
}

export default recipeFormPanel({id: 'sceneSelectionOptions', fields})(SceneSelectionOptions)
