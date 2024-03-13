import {Form} from '~/widget/form'
import {FormCombo} from '~/widget/form/combo'
import {Layout} from '~/widget/layout'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import {validateExpression} from './expression'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React, {Component} from 'react'

const mapRecipeToProps = recipe => ({
    legend: selectFrom(recipe, 'model.legend')
})

class _ClassStep extends Component {
    state = {}

    render() {
        const {inputs: {type}} = this.props
        return (
            <Layout>
                {this.renderFilterExpression()}
                {this.renderClassColumnFormat()}
                {type.value === 'SAMPLE_CLASSIFICATION'
                    ? null // We select the value column up-front
                    : this.renderValueColumnInput()}
            </Layout>
        )
    }

    renderFilterExpression() {
        const {inputs: {inputData, filterExpression, invalidFilterExpression}} = this.props
        return (
            <Form.Input
                label={msg('Row filter expression')}
                placeholder={msg('Enter expression')}
                tooltip={msg('Enter expression determining which rows to include, or leave empty')}
                input={filterExpression}
                onBlur={() => {
                    try {
                        validateExpression({expression: filterExpression.value, rows: inputData.value})
                        invalidFilterExpression.set(false)
                    } catch (e) {
                        filterExpression.setInvalid(e.message)
                        invalidFilterExpression.set(true)
                    }
                }}
            />
        )
    }

    renderClassColumnFormat() {
        const {inputs: {classColumnFormat}} = this.props
        const classColumnFormatOptions = [
            {
                value: 'SINGLE_COLUMN',
                label: msg(['process.classification.panel.trainingData.form.class.classColumnFormat.options.SINGLE_COLUMN.label']),
                tooltip: msg(['process.classification.panel.trainingData.form.class.classColumnFormat.options.SINGLE_COLUMN.tooltip'])
            },
            {
                value: 'MULTIPLE_COLUMNS',
                label: msg(['process.classification.panel.trainingData.form.class.classColumnFormat.options.MULTIPLE_COLUMNS.label']),
                tooltip: msg(['process.classification.panel.trainingData.form.class.classColumnFormat.options.MULTIPLE_COLUMNS.tooltip'])
            },
            {
                value: 'OTHER_FORMAT',
                label: msg(['process.classification.panel.trainingData.form.class.classColumnFormat.options.OTHER_FORMAT.label']),
                tooltip: msg(['process.classification.panel.trainingData.form.class.classColumnFormat.options.OTHER_FORMAT.tooltip'])
            }
        ]
        return (
            <Form.Buttons
                label={msg(['process.classification.panel.trainingData.form.class.classColumnFormat.label'])}
                input={classColumnFormat}
                options={classColumnFormatOptions}/>
        )
    }

    renderValueColumnInput() {
        const {inputs: {classColumnFormat, valueColumn}} = this.props
        if (classColumnFormat.value !== 'SINGLE_COLUMN')
            return null

        const columnOptions = this.columns().map(column => ({value: column, label: column}))
        return (
            <FormCombo
                input={valueColumn}
                options={columnOptions}
                label={msg('process.classification.panel.trainingData.form.class.valueColumn.label')}
                placeholder={msg('process.classification.panel.trainingData.form.class.valueColumn.placeholder')}
                tooltip={msg('process.classification.panel.trainingData.form.class.valueColumn.tooltip')}
            />
        )
    }

    componentDidMount() {
        const {inputs: {columns, classColumnFormat, filterExpression, valueColumn}} = this.props
        if (classColumnFormat.value)
            return // Already initialized
        if (this.containsColumns('FLAGGED', 'CENTER_LON', 'CENTER_LAT')
            && columns.value.find(column => column.indexOf(':'))) { // Collect Earth Online
            classColumnFormat.set('MULTIPLE_COLUMNS')
            filterExpression.set('!FLAGGED && ANALYSES')
        } else if (columns.value.includes('class')) {
            classColumnFormat.set('SINGLE_COLUMN')
            valueColumn.set('class')
        } else if (columns.value.includes('land_use_category')) { // Collect Earth
            classColumnFormat.set('SINGLE_COLUMN')
            valueColumn.set('land_use_category')
        } else {
            classColumnFormat.set('SINGLE_COLUMN')
        }
    }

    // TODO: Refactor this into separate file - it's used by classMappingStep too
    containsColumns(...columnNames) {
        const {inputs: {columns}} = this.props
        return columnNames.every(columnName => columns.value.includes(columnName))
    }

    columns() {
        const {inputs: {columns, geoJsonColumn, xColumn, yColumn}} = this.props
        // TODO: Maybe we still have values for geoJsonColumn even if xy columns are used
        return columns.value
            .filter(column => ![geoJsonColumn.value, xColumn.value, yColumn.value].includes(column))

    }

}

export const ClassStep = compose(
    _ClassStep,
    withRecipe(mapRecipeToProps)
)

ClassStep.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.any
}
