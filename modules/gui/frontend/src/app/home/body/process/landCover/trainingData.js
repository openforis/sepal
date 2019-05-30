import {Constraint} from 'widget/form'
import {Field, Input, form} from 'widget/form'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from './landCoverRecipe'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {initValues, withRecipePath} from 'app/home/body/process/recipe'
import {loadFusionTableColumns$} from 'app/home/map/fusionTable'
import {map, takeUntil} from 'rxjs/operators'
import {msg} from 'translate'
import Combo from 'widget/combo'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './trainingData.module.css'

const fields = {
    fusionTable: new Field()
        .notBlank('process.landCover.panel.trainingData.form.fusionTable.required'),
    yearColumn: new Field()
        .notBlank('process.landCover.panel.trainingData.form.yearColumn.required'),
    classColumn: new Field()
        .notBlank('process.landCover.panel.trainingData.form.classColumn.required')
}

const constraints = {
    yearAndClassColumnsSame: new Constraint(['yearColumn', 'classColumn'])
        .skip(({fusionTable}) => {
            return !fusionTable
        })
        .predicate(({yearColumn, classColumn}) => {
            return yearColumn !== classColumn
        }, 'process.landCover.panel.trainingData.form.yearAndClassColumnsSame')
}

class TrainingData extends React.Component {
    constructor(props) {
        super(props)
        this.fusionTableChanged$ = new Subject()
        this.recipeActions = RecipeActions(props.recipeId)
    }

    loadFusionTableColumns(fusionTableId) {
        this.props.asyncActionBuilder('LOAD_FUSION_TABLE_COLUMNS',
            loadFusionTableColumns$(fusionTableId, {includedTypes: ['NUMBER']}).pipe(
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
        const {recipePath, primitiveTypes, form} = this.props
        return (
            <FormPanel
                className={styles.panel}
                form={form}
                statePath={recipePath + '.ui'}
                onApply={values => this.recipeActions.setTrainingData({
                    values,
                    model: valuesToModel(values, primitiveTypes)
                }).dispatch()}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.landCover.panel.trainingData.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <FormPanelButtons/>
            </FormPanel>
        )
    }

    renderContent() {
        const {action, columns, inputs: {fusionTable, yearColumn, classColumn}} = this.props
        const columnState = action('LOAD_FUSION_TABLE_COLUMNS').dispatching
            ? 'loading'
            : columns && columns.length > 0
                ? 'loaded'
                : 'noFusionTable'

        const yearPlaceholder = msg(`process.landCover.panel.trainingData.form.yearColumn.placeholder.${columnState}`)
        const classPlaceholder = msg(`process.landCover.panel.trainingData.form.classColumn.placeholder.${columnState}`)
        return (
            <React.Fragment>
                <Input
                    label={msg('process.landCover.panel.trainingData.form.fusionTable.label')}
                    autoFocus
                    input={fusionTable}
                    placeholder={msg('process.landCover.panel.trainingData.form.fusionTable.placeholder')}
                    spellCheck={false}
                    onChange={e => {
                        yearColumn.set('')
                        classColumn.set('')
                        this.recipeActions.setFusionTableColumns(null).dispatch()
                        this.fusionTableChanged$.next()
                        const fusionTableMinLength = 30
                        if (e && e.target.value.length > fusionTableMinLength)
                            this.loadFusionTableColumns(e.target.value)
                    }}
                    errorMessage
                />
                <Combo
                    label={msg('process.landCover.panel.trainingData.form.yearColumn.label')}
                    input={yearColumn}
                    busy={action('LOAD_FUSION_TABLE_COLUMNS').dispatching}
                    disabled={!columns || columns.length === 0}
                    placeholder={yearPlaceholder}
                    options={(columns || []).map(({name}) => ({value: name, label: name}))}
                />
                <Combo
                    label={msg('process.landCover.panel.trainingData.form.classColumn.label')}
                    input={classColumn}
                    busy={action('LOAD_FUSION_TABLE_COLUMNS').dispatching}
                    disabled={!columns || columns.length === 0}
                    placeholder={classPlaceholder}
                    options={(columns || []).map(({name}) => ({value: name, label: name}))}
                    errorMessage={[classColumn, 'yearAndClassColumnsSame']}
                />
            </React.Fragment>
        )
    }
}

TrainingData.propTypes = {
    recipeId: PropTypes.string,
}

const valuesToModel = (values, primitiveTypes) => {
    const classByPrimitive = {}
    primitiveTypes && primitiveTypes.forEach(primitiveType => {
        return classByPrimitive[primitiveType.id] = primitiveType.value
    }
    )
    return {
        type: 'fusionTable',
        tableId: values.fusionTable,
        yearColumn: values.yearColumn,
        classColumn: values.classColumn,
        classByPrimitive
    }
}

const modelToValues = (model = {}) => ({
    fusionTable: model.tableId,
    yearColumn: model.yearColumn,
    classColumn: model.classColumn
})

export default compose(
    TrainingData,
    form({fields, constraints}),
    initValues({
        getModel: props => RecipeState(props.recipeId)('model.trainingData'),
        getValues: props => RecipeState(props.recipeId)('ui.trainingData'),
        modelToValues,
        onInitialized: ({model, values, props}) =>
            RecipeActions(props.recipeId)
                .setTrainingData({values, model})
                .dispatch()
    })
)

// export default withRecipePath()(
//     initValues({
//         getModel: props => RecipeState(props.recipeId)('model.trainingData'),
//         getValues: props => RecipeState(props.recipeId)('ui.trainingData'),
//         modelToValues,
//         onInitialized: ({model, values, props}) =>
//             RecipeActions(props.recipeId)
//                 .setTrainingData({values, model})
//                 .dispatch()
//     })(
//         form({fields, constraints})(TrainingData)
//     )
// )
