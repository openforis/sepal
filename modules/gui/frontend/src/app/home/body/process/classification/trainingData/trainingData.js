import {Field, Input, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from '../classificationRecipe'
import {Subject} from 'rxjs'
import {initValues, withRecipePath} from 'app/home/body/process/recipe'
import {isMobile} from 'widget/userAgent'
import {loadFusionTableColumns$} from 'app/home/map/fusionTable'
import {map, takeUntil} from 'rxjs/operators'
import ComboBox from 'widget/comboBox'
import FormPanel from 'widget/formPanel'
import FormPanelButtons from 'widget/formPanelButtons'
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
    const recipeState = RecipeState(ownProps.recipeId)
    return {columns: recipeState('ui.fusionTable.columns')}
}

class TrainingData extends React.Component {
    constructor(props) {
        super(props)
        this.fusionTableChanged$ = new Subject()
        this.recipeActions = RecipeActions(props.recipeId)
    }

    loadFusionTableColumns(fusionTableId) {
        const {asyncActionBuilder, inputs: {fusionTableColumn}} = this.props
        asyncActionBuilder('LOAD_FUSION_TABLE_COLUMNS',
            loadFusionTableColumns$(fusionTableId, {includedTypes: ['NUMBER']}).pipe(
                map(response => {
                    if (response.error)
                        this.props.inputs.fusionTable.setInvalid(
                            msg(response.error.key)
                        )
                    return (response.columns || [])
                        .filter(column => column.type !== 'LOCATION')
                }),
                map(columns => columns.map(({name}) => ({value: name, label: name}))),
                map(columns => {
                    const defaultColumn = columns.length === 1 ? columns[0] : columns.find(column => column.value === 'class')
                    if (defaultColumn)
                        fusionTableColumn.set(defaultColumn.value)
                    return this.recipeActions.setFusionTableColumns(columns)
                }),
                takeUntil(this.fusionTableChanged$))
        )
            .dispatch()
    }

    render() {
        const {recipePath, form} = this.props
        return (
            <FormPanel
                className={styles.panel}
                form={form}
                statePath={recipePath + '.ui'}
                onApply={values => this.recipeActions.setTrainingData({
                    values,
                    model: valuesToModel(values)
                }).dispatch()}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.classification.panel.trainingData.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <FormPanelButtons/>
            </FormPanel>
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
                <Input
                    label={msg('process.classification.panel.trainingData.form.fusionTable.label')}
                    autoFocus={!isMobile()}
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
                    errorMessage
                />
                <ComboBox
                    label={msg('process.classification.panel.trainingData.form.fusionTableColumn.label')}
                    input={fusionTableColumn}
                    isLoading={action('LOAD_FUSION_TABLE_COLUMNS').dispatching}
                    disabled={!columns || columns.length === 0}
                    placeholder={msg(`process.classification.panel.trainingData.form.fusionTableColumn.placeholder.${columnState}`)}
                    options={columns || []}
                    errorMessage
                />

                <p>
                    <a href='/ceo' target='_blank'><Msg id='process.classification.panel.trainingData.form.openCeo'/></a>
                </p>
            </React.Fragment>
        )
    }

    componentDidMount() {
        const {inputs: {fusionTable}} = this.props
        if (fusionTable.value)
            this.loadFusionTableColumns(fusionTable.value)
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

export default withRecipePath()(
    initValues({
        getModel: props => RecipeState(props.recipeId)('model.trainingData'),
        getValues: props => RecipeState(props.recipeId)('ui.trainingData'),
        modelToValues,
        onInitialized: ({model, values, props}) =>
            RecipeActions(props.recipeId)
                .setTrainingData({values, model})
                .dispatch()
    })(
        form({fields, mapStateToProps})(TrainingData)
    )
)
