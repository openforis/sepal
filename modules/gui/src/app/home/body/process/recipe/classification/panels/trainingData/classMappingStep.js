import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Combo} from 'widget/combo'
import {CrudItem} from 'widget/crudItem'
import {Input} from 'widget/input'
import {Layout} from 'widget/layout'
import {LegendItem} from 'widget/legend/legendItem'
import {ListItem} from 'widget/listItem'
import {compose} from 'compose'
import {filterReferenceData$, remapReferenceData$} from './inputData'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import ButtonPopup from 'widget/buttonPopup'
import Icon from 'widget/icon'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import _ from 'lodash'
import styles from './classStep.module.css'

const mapRecipeToProps = recipe => ({
    legend: selectFrom(recipe, 'model.legend'),
    recipe
})

class ClassMappingStep extends Component {
    state = {
        columnValues: [],
        customMapping: {},
        mappingError: null
    }

    render() {
        return (
            <Layout>
                {this.renderSingleColumnForm()}
                {this.renderMultipleColumnsForm()}
                {this.renderOtherFormatForm()}
            </Layout>
        )
    }

    renderSingleColumnForm() {
        const {inputs: {classColumnFormat}} = this.props
        const {columnValues} = this.state
        if (classColumnFormat.value !== 'SINGLE_COLUMN')
            return null

        return this.renderClasses(
            legendValue =>
                this.renderSelectionMapping({
                    label: msg('process.classification.panel.trainingData.classMapping.columnValues'),
                    noDataMessage: msg('process.classification.panel.trainingData.classMapping.noColumValuesSelected'),
                    values: columnValues,
                    mappingType: 'valueMapping',
                    legendValue
                })
        )
    }

    renderMultipleColumnsForm() {
        const {inputs: {classColumnFormat}} = this.props
        if (classColumnFormat.value !== 'MULTIPLE_COLUMNS')
            return null

        const columns = this.columns()
        return this.renderClasses(
            legendValue => this.renderSelectionMapping({
                label: msg('process.classification.panel.trainingData.classMapping.columnValues'),
                noDataMessage: msg('process.classification.panel.trainingData.classMapping.noColumValuesSelected'),
                values: columns,
                mappingType: 'columnMapping',
                legendValue
            })
        )
    }

    renderSelectionMapping({label, noDataMessage, values, mappingType, legendValue}) {
        const mapping = this.getMapping(mappingType)
        return (
            <React.Fragment>
                <Layout type='horizontal-nowrap' spacing='compact' className={styles.valueSelectionRow}>
                    <Label msg={label}/>
                    <Layout.Spacer/>
                    {this.renderCount(legendValue)}
                    {this.renderSelectionWidget({values, mappingType, legendValue})}
                </Layout>
                <ButtonGroup>
                    {this.renderMapping(mappingType, legendValue)}
                </ButtonGroup>
                {!mapping?.value[legendValue] || !mapping?.value[legendValue].length
                    ? <div className={styles.noData}>{noDataMessage}</div>
                    : null
                }
            </React.Fragment>
        )
    }

    renderSelectionWidget({values, mappingType, legendValue}) {
        const mappedValues = (this.getMapping(mappingType).value || {})[legendValue] || []
        const valueOptions = values
            .map(value => ({value, label: `${value}`}))
            .filter(({value}) => !mappedValues.includes(value))
        return (
            <ButtonPopup
                key='selectionWidget'
                look='add'
                shape='circle'
                icon='plus'
                size='x-small'
                noChevron
                vPlacement='below'
                hPlacement='over-left'
                tooltip={msg('process.classification.panel.trainingData.classMapping.addColumns.tooltip')}>
                {onBlur => (
                    <Combo
                        // placement='below'
                        alignment='left'
                        placeholder={msg('process.classification.panel.trainingData.classMapping.addColumns.placeholder')}
                        options={valueOptions}
                        disabled={!valueOptions.length}
                        stayOpenOnSelect
                        autoOpen
                        autoFocus
                        allowClear
                        onCancel={onBlur}
                        onChange={option => {
                            this.addMapping(this.getMapping(mappingType), legendValue, option.value)
                        }}
                    />
                )}
            </ButtonPopup>
        )
    }

    renderCount(legendValue) {
        const {stream, inputs: {referenceData}} = this.props
        const active = stream('UPDATE_REFERENCE_DATA').active
        return (
            <div className={styles.count}>
                {active
                    ? <Icon name='spinner'/>
                    : referenceData.value ?
                        (referenceData.value.counts[legendValue] || 0)
                        : null
                }
            </div>
        )
    }

    renderMapping(mappingType, legendValue) {
        const values = (this.getMapping(mappingType).value || {})[legendValue] || []
        return values.map(value =>
            <Button
                key={value}
                label={value}
                size='small'
                air='less'
                tooltip={msg('process.classification.panel.trainingData.classMapping.removeColumnValue')}
                onClick={() => this.removeMapping(this.getMapping(mappingType), legendValue, value)}
                icon='times'
            />
        )
    }

    renderOtherFormatForm() {
        const {inputs: {classColumnFormat, customMapping}} = this.props
        if (classColumnFormat.value !== 'OTHER_FORMAT')
            return null
        return this.renderClasses(
            legendValue => {
                const {mappingError} = this.state
                const errorMessage = mappingError && `${mappingError.legendValue}` === `${legendValue}` ? mappingError.message : null
                return (
                    <React.Fragment>
                        {/* [HACK] <Layout type='horizontal-nowrap'> prevent errmr message from showing */}
                        <div className={styles.expressionRow}>
                            <Input
                                className={styles.expression}
                                placeholder={msg('process.classification.panel.trainingData.classMapping.enterExpression')}
                                value={this.state.customMapping[legendValue] || ''}
                                errorMessage={errorMessage}
                                onChange={e => {
                                    const value = e.target.value
                                    this.setState(prevState => ({
                                        customMapping: {
                                            ...prevState.customMapping,
                                            [legendValue]: value

                                        },
                                        mappingError: null
                                    }))
                                }}
                                onBlur={() => customMapping.set({...this.state.customMapping})}
                            />
                            {this.renderCount(legendValue)}
                        </div>
                    </React.Fragment>
                )
            }
        )
    }

    renderClasses(legendValueRenderer) {
        const {legend} = this.props
        const renderEntry = ({id, color, value, label}) =>
            <ListItem
                key={id}
                expansion={legendValueRenderer(value)}
                expanded>
                <CrudItem
                    content={this.renderLegendItem({color, value, label})}
                    inlineComponents={[this.renderDefaultButton(value)]}
                />
            </ListItem>

        return legend.entries.map(renderEntry)
    }

    renderLegendItem({color, value, label}) {
        return (
            <LegendItem
                color={color}
                label={label}
                value={value}
            />
        )
    }

    renderDefaultButton(value) {
        const {inputs: {defaultValue}} = this.props
        return (
            <Button
                key='default'
                shape='pill'
                look={defaultValue.value === value ? 'selected' : 'default'}
                size='small'
                label='Default'
                tooltip={'Class to use for locations where no column value was mapped'}
                onClick={() => defaultValue.set(defaultValue.value === value ? null : value)}
            />
        )
    }

    getMapping(mappingType) {
        return this.props.inputs[mappingType]
    }
 
    addMapping(mapping, legendValue, value) {
        const valuesByLegendValue = {...mapping.value}
        Object.keys(valuesByLegendValue)
            .forEach(legendValue => {
                const filtered = valuesByLegendValue[legendValue]
                    .filter(c => value !== c)
                return valuesByLegendValue[legendValue] = filtered
            })

        const columnValues = (valuesByLegendValue[legendValue] || [])
            .filter(c => value !== c)
        const updatedMapping = {...valuesByLegendValue, [legendValue]: [...columnValues, value]}
        mapping.set(updatedMapping)
    }

    removeMapping(mapping, legendValue, value) {
        const valuesByLegendValue = mapping.value || {}
        const values = valuesByLegendValue[legendValue] || []
        const filtered = values.filter(v => v !== value)
        mapping.set({...valuesByLegendValue, [legendValue]: filtered})
    }

    componentDidMount() {
        const {inputs: {columns, classColumnFormat, referenceData}} = this.props
        if (classColumnFormat.value === 'SINGLE_COLUMN') {
            const columnValues = this.distinctColumnValues()
            this.setState({columnValues})
            this.setValueMappingDefault(columnValues)
        }
        if (classColumnFormat.value === 'MULTIPLE_COLUMNS') {
            if (this.containsColumns('CENTER_LON', 'CENTER_LAT') && columns.value.find(column => column.indexOf(':'))) {
                this.setColumnMappingDefaultFromCEO()
            }
        }
        referenceData.set(null)
        this.filterReferenceData()
    }

    componentDidUpdate(prevProps) {
        const {stream, inputs: {valueMapping, columnMapping, customMapping, referenceData, defaultValue}} = this.props
        const {inputs: {valueMapping: prevValueMapping, columnMapping: prevColumnMapping, customMapping: prevCustomMapping, defaultValue: prevDefaultValue}} = prevProps
        const notAlreadyUpdatingReferenceData = !stream('UPDATE_REFERENCE_DATA').active
        const noReferenceData = !referenceData.value
        const updatedMapping = !_.isEqual(valueMapping.value, prevValueMapping.value)
            || !_.isEqual(columnMapping.value, prevColumnMapping.value)
            || !_.isEqual(customMapping.value, prevCustomMapping.value)
            || !_.isEqual(defaultValue.value, prevDefaultValue.value)
        if (notAlreadyUpdatingReferenceData && (noReferenceData || updatedMapping)) {
            this.remapReferenceData()
        }
    }

    filterReferenceData() {
        const {stream, inputs, recipe} = this.props
        stream('UPDATE_REFERENCE_DATA',
            filterReferenceData$({inputs, recipe}),
            referenceData => this.setState({referenceData})
        )
    }

    remapReferenceData() {
        const {stream, inputs} = this.props
        const {referenceData} = this.state
        if (!referenceData) {
            return
        }
        inputs.referenceData.set(null) // Unset while updating
        stream('UPDATE_REFERENCE_DATA',
            remapReferenceData$({inputs, referenceData}),
            remappedReferenceData => inputs.referenceData.set(remappedReferenceData),
            e => {
                inputs.referenceData.set({counts: {}, referenceData: []})
                this.setState({mappingError: e})
            }
        )
    }

    setValueMappingDefault(columnValues) {
        const {legend, inputs: {valueMapping}} = this.props
        const initialized = valueMapping.value
        if (initialized)
            return
        const columnValuesByLegendValue = {}
        legend.entries.forEach(({value}) =>
            columnValuesByLegendValue[value] = columnValues.filter(c => `${c}` === `${value}`)
        )
        valueMapping.set(columnValuesByLegendValue)
    }

    setColumnMappingDefaultFromCEO() {
        const {legend, inputs: {columns, columnMapping}} = this.props
        const initialized = columnMapping.value
        if (initialized)
            return
        const answerColumns = columns.value.filter(column => column.includes(':'))
        const questions = _.groupBy(answerColumns, column => column.substring(0, column.indexOf(':')))
        const values = Object.values(questions)
            .find(values => values.length === legend.entries.length)
        if (values) {
            const columnsByLegendValue = {}
            legend.entries.forEach(({value}, i) =>
                columnsByLegendValue[value] = [values[i]]
            )
            columnMapping.set(columnsByLegendValue)
        }
    }

    containsColumns(...columnNames) {
        const {inputs: {columns}} = this.props
        return columnNames.every(columnName => columns.value.includes(columnName))
    }

    distinctColumnValues() {
        const {inputs: {inputData, valueColumn}} = this.props
        const distinct = [...new Set(inputData.value.map(row => row[valueColumn.value]))]
        const compare = (a, b) => {
            const aNumber = _.isNumber(a)
            const bNumber = _.isNumber(b)
            if (aNumber && bNumber) {
                return a - b
            } else if (aNumber) {
                return a
            } else if (bNumber) {
                return b
            } else {
                return a > b
            }
        }
        return distinct.sort(compare)
    }

    columns() {
        const {inputs: {columns, geoJsonColumn, xColumn, yColumn}} = this.props
        // TODO: Maybe we still have values for geoJsonColumn even if xy columns are used
        return columns.value
            .filter(column => ![geoJsonColumn.value, xColumn.value, yColumn.value].includes(column))

    }
}

ClassMappingStep.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.any
}

export default compose(
    ClassMappingStep,
    withRecipe(mapRecipeToProps)
)

