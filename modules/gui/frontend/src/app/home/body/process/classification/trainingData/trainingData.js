import {ErrorMessage, Field, Input, Label, form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState, recipePath} from '../classificationRecipe'
import {Subject} from 'rxjs'
import {loadFusionTableColumns$} from 'app/home/map/fusionTable'
import {map, takeUntil} from 'rxjs/operators'
import {msg} from 'translate'
import ComboBox from 'widget/comboBox'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './trainingData.module.css'

const fields = {
    fusionTable: new Field()
        .notBlank('process.classification.panel.trainingData.form.fusionTable.required'),
    fusionTableColumn: new Field()
        .notBlank('process.classification.panel.trainingData.form.fusionTableColumn.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.trainingData')
    if (!values) {
        const model = recipeState('model.trainingData')
        values = modelToValues(model)
        RecipeActions(recipeId).setTrainingData({values, model}).dispatch()
    }
    return {
        values,
        columns: recipeState('ui.fusionTable.columns')
    }
}

class TrainingData extends React.Component {
    constructor(props) {
        super(props)
        this.fusionTableChanged$ = new Subject()
        this.recipeActions = RecipeActions(props.recipeId)
    }

    loadFusionTableColumns(fusionTableId) {
        this.props.asyncActionBuilder('LOAD_FUSION_TABLE_COLUMNS',
            loadFusionTableColumns$(fusionTableId).pipe(
                map(response => {
                    if (response.error)
                        this.props.inputs.fusionTable.setInvalid(
                            msg(response.error.key)
                        )
                    return (response.columns || [])
                        .filter(column => column.type !== 'LOCATION')
                }),
                map(columns => this.recipeActions.setFusionTableColumns(columns)),
                takeUntil(this.fusionTableChanged$))
        )
            .dispatch()
    }

    render() {
        const {recipeId, form} = this.props
        return (
            <Panel className={styles.panel}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.classification.panel.trainingData.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons
                    form={form}
                    statePath={recipePath(recipeId, 'ui')}
                    onApply={values => this.recipeActions.setTrainingData({
                        values,
                        model: valuesToModel(values)
                    }).dispatch()}/>
            </Panel>
        )
    }

    renderContent() {
        const {action, columns, inputs: {fusionTable, fusionTableColumn}} = this.props
        const columnState = action('LOAD_FUSION_TABLE_COLUMNS').dispatching
            ? 'loading'
            : columns && columns.length > 0
                ? 'loaded'
                : 'noFusionTable'
        return (
            <React.Fragment>
                <div>
                    <Label msg={msg('process.classification.panel.trainingData.form.fusionTable.label')}/>
                    <Input
                        autoFocus
                        input={fusionTable}
                        placeholder={msg('process.classification.panel.trainingData.form.fusionTable.placeholder')}
                        spellCheck={false}
                        onChange={e => {
                            fusionTableColumn.set('')
                            this.recipeActions.setFusionTableColumns(null).dispatch()
                            this.fusionTableChanged$.next()
                            const fusionTableMinLength = 30
                            if (e && e.target.value.length > fusionTableMinLength)
                                this.loadFusionTableColumns(e.target.value)
                        }}
                    />
                    <ErrorMessage for={fusionTable}/>
                </div>

                <div>
                    <Label msg={msg('process.classification.panel.trainingData.form.fusionTableColumn.label')}/>
                    <ComboBox
                        input={fusionTableColumn}
                        isLoading={action('LOAD_FUSION_TABLE_COLUMNS').dispatching}
                        disabled={!columns || columns.length === 0}
                        placeholder={msg(`process.classification.panel.trainingData.form.fusionTableColumn.placeholder.${columnState}`)}
                        options={(columns || []).map(({name}) => ({value: name, label: name}))}/>
                    <ErrorMessage for={fusionTableColumn}/>
                </div>
            </React.Fragment>
        )
    }
}

TrainingData.propTypes = {
    recipeId: PropTypes.string
}

const valuesToModel = values => ({
    ...values
})

const modelToValues = (model = {}) => ({
    ...model
})

export default form({fields, mapStateToProps})(TrainingData)
