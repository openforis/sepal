import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Msg, msg} from 'translate'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from '../classificationRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {map, takeUntil} from 'rxjs/operators'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './trainingData.module.css'
import api from 'api'

const fields = {
    eeTable: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.eeTable.required'),
    eeTableColumn: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.eeTableColumn.required')
}

const mapRecipeToProps = recipe => ({
    columns: selectFrom(recipe, 'ui.eeTable.columns')
})

class TrainingData extends React.Component {
    constructor(props) {
        super(props)
        this.eeTableChanged$ = new Subject()
        this.recipeActions = RecipeActions(props.recipeId)
    }

    loadEETableColumns(eeTableId) {
        const {stream, inputs: {eeTableColumn}} = this.props
        stream('LOAD_EE_TABLE_COLUMNS',
            api.gee.loadEETableColumns$(eeTableId).pipe(
                map(columns => columns.map(name => ({value: name, label: name}))),
                takeUntil(this.eeTableChanged$)),
            columns => {
                const defaultColumn = columns.length === 1 ? columns[0] : columns.find(column => column.value === 'class')
                if (defaultColumn)
                    eeTableColumn.set(defaultColumn.value)
                this.recipeActions.setEETableColumns(columns).dispatch()
            },
            error => {
                return this.props.inputs.eeTable.setInvalid(
                    msg(error.response.code, error.response.data)
                )
            }
        )
    }

    render() {
        const {recipeId} = this.props
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}
                onClose={() => RecipeActions(recipeId).showPreview().dispatch()}>
                <Panel.Header
                    icon='cog'
                    title={msg('process.classification.panel.trainingData.title')}/>

                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {action, columns, inputs: {eeTable, eeTableColumn}} = this.props
        const columnState = action('LOAD_EE_TABLE_COLUMNS').dispatching
            ? 'loading'
            : columns && columns.length > 0
                ? 'loaded'
                : 'noEETable'
        return (
            <Layout>
                <Form.Input
                    label={msg('process.classification.panel.trainingData.form.eeTable.label')}
                    autoFocus
                    input={eeTable}
                    placeholder={msg('process.classification.panel.trainingData.form.eeTable.placeholder')}
                    spellCheck={false}
                    onChange={e => {
                        eeTableColumn.set('')
                        this.recipeActions.setEETableColumns(null).dispatch()
                        this.eeTableChanged$.next()
                        this.loadEETableColumns(e.target.value)
                    }}
                    errorMessage
                />
                <Form.Combo
                    label={msg('process.classification.panel.trainingData.form.eeTableColumn.label')}
                    input={eeTableColumn}
                    busy={action('LOAD_EE_TABLE_COLUMNS').dispatching}
                    disabled={!columns || columns.length === 0}
                    placeholder={msg(`process.classification.panel.trainingData.form.eeTableColumn.placeholder.${columnState}`)}
                    options={columns || []}
                />
                <p>
                    <a href='/ceo' target='_blank'><Msg
                        id='process.classification.panel.trainingData.form.openCeo'/></a>
                </p>
            </Layout>
        )
    }

    componentDidMount() {
        const {recipeId, inputs: {eeTable}} = this.props
        if (eeTable.value)
            this.loadEETableColumns(eeTable.value)
        RecipeActions(recipeId).hidePreview().dispatch()
    }
}

TrainingData.propTypes = {
    recipeId: PropTypes.string
}

export default compose(
    TrainingData,
    recipeFormPanel({id: 'trainingData', fields, mapRecipeToProps})
)
