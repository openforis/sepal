import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import Buttons from 'widget/buttons'
import {Field, form, Label} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import {RecipeActions, RecipeState, SceneSelectionType} from '../../mosaicRecipe'
import styles from './scenes.module.css'

const fields = {
    type: new Field()
        .notEmpty('process.mosaic.panel.scenes.form.required'),

    targetDateWeight: new Field()
}

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        values: recipeState('ui.sceneSelectionOptions')
    }
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
        const {recipeId, form, inputs: {type}} = this.props
        return (
            <Panel className={styles.panel}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.mosaic.panel.scenes.title')}/>

                <PanelContent>
                    <div>
                        {this.renderTypes()}
                        {type.value === SceneSelectionType.SELECT ? this.renderTargetDateWeight() : null}
                    </div>
                </PanelContent>

                <PanelButtons
                    statePath={recipePath(recipeId, 'ui')}
                    form={form}
                    onApply={(sources) => this.recipeActions.setSceneSelectionOptions(sources).dispatch()}/>
            </Panel>
        )
    }
}

Scenes.propTypes = {
    recipeId: PropTypes.string,
    form: PropTypes.object,
    fields: PropTypes.object,
    action: PropTypes.func,
    values: PropTypes.object
}

export default form({fields, mapStateToProps})(Scenes)
