import * as PropTypes from 'prop-types'
import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Combo} from 'widget/combo'
import {Input} from 'widget/input'
import {Layout} from 'widget/layout'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {toReferenceData$} from './inputData'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Icon from 'widget/icon'
import Label from 'widget/label'
import React, {Component} from 'react'
import _ from 'lodash'
import styles from './classStep.module.css'

const mapRecipeToProps = recipe => ({
    legend: selectFrom(recipe, 'model.legend')
})

class ClassMappingStep extends Component {
    state = {
        addingMapping: null,
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
        const {inputs: {classColumnFormat, valueMapping}} = this.props
        const {columnValues} = this.state
        if (classColumnFormat.value !== 'SINGLE_COLUMN')
            return null

        return this.renderClasses(
            legendValue =>
                this.renderSelectionMapping({
                    label: msg('Column value(s)'),
                    noDataMessage: msg('No column value selected for this class'),
                    values: columnValues,
                    mapping: valueMapping,
                    legendValue
                })
        )
    }

    renderMultipleColumnsForm() {
        const {inputs: {classColumnFormat, columnMapping}} = this.props
        if (classColumnFormat.value !== 'MULTIPLE_COLUMNS')
            return null

        const columns = this.columns()
        return this.renderClasses(
            legendValue => this.renderSelectionMapping({
                label: msg('Column(s)'),
                noDataMessage: msg('No column selected for this class'),
                values: columns,
                mapping: columnMapping,
                legendValue
            })
        )
    }

    renderSelectionMapping({label, noDataMessage, values, mapping, legendValue}) {
        const {addingMapping} = this.state
        const valueOptions = values.map(value => ({value, label: `${value}`}))
        return (
            <React.Fragment>
                {/* <Widget
                    className={styles.valueSelectionRow}
                    type='horizontal-nowrap'
                    spacing='compact'
                    label={label}>
                    <Layout type='horizontal-nowrap' spacing='compact'>
                        {addingMapping === legendValue
                            ? <Combo
                                className={styles.valueSelectionCombo}
                                standalone='true'
                                autoFocus
                                options={valueOptions}
                                disabled={!valueOptions.length}
                                onChange={option => {
                                    this.addMapping(mapping, legendValue, option.value)
                                    this.openSelector(null)
                                }}
                                onCancel={() => this.openSelector(null)}
                            />
                            : null}
                        {this.renderCount(legendValue)}
                        <Button
                            icon='plus'
                            look='add'
                            shape='circle'
                            size='small'
                            onClick={() => this.openSelector(legendValue)}/>
                    </Layout>
                </Widget> */}
                <Layout type='horizontal-nowrap' spacing='compact' className={styles.valueSelectionRow}>
                    <Label msg={label}/>
                    <Layout.Spacer/>
                    {addingMapping === legendValue
                        ? <Combo
                            className={styles.valueSelectionCombo}
                            standalone='true'
                            autoFocus
                            options={valueOptions}
                            disabled={!valueOptions.length}
                            onChange={option => {
                                this.addMapping(mapping, legendValue, option.value)
                                this.openSelector(null)
                            }}
                            onCancel={() => this.openSelector(null)}
                        />
                        : null}
                    {this.renderCount(legendValue)}
                    <Button
                        icon='plus'
                        look='add'
                        shape='circle'
                        size='small'
                        onClick={() => this.openSelector(legendValue)}/>
                </Layout>
                <ButtonGroup>
                    {this.renderMapping(mapping, legendValue)}
                </ButtonGroup>
                {!mapping.value[legendValue] || !mapping.value[legendValue].length
                    ? <div className={styles.noData}>{noDataMessage}</div>
                    : null
                }
            </React.Fragment>
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

    renderMapping(mapping, legendValue) {
        const values = (mapping.value || {})[legendValue] || []
        return values.map(value =>
            <MappedValue
                key={value}
                value={value}
                onClick={() => this.removeMapping(mapping, legendValue, value)}/>
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
                                placeholder={msg('Enter expression')}
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
        const {legend, inputs: {defaultValue}} = this.props
        const renderEntry = ({id, color, value, label}) =>
            <div key={id} className={styles.mapping}>
                <Layout type='horizontal-nowrap'>
                    <div className={styles.entry}>
                        <div className={styles.color} style={{'--color': color}}/>
                        <div className={styles.value}>{value}</div>
                        <div className={styles.label}>{label}</div>
                    </div>
                    <Button
                        label={'Default'}
                        labelStyle='smallcaps'
                        tooltip={'Class to use for locations where no column value was mapped'}
                        look={defaultValue.value === value ? 'selected' : 'default'}
                        shape='pill'
                        size='small'
                        onClick={() => defaultValue.set(defaultValue.value === value ? null : value)}
                    />
                </Layout>
                <div className={styles.input}>
                    {legendValueRenderer(value)}
                </div>
            </div>

        return legend.entries.map(renderEntry)
    }

    openSelector(legendValue) {
        this.setState({addingMapping: legendValue})
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
            this.updateReferenceData()
        }
    }

    updateReferenceData() {
        const {stream, inputs} = this.props
        inputs.referenceData.set(null) // Unset while updating
        stream('UPDATE_REFERENCE_DATA',
            toReferenceData$(inputs),
            updatedReferenceData => inputs.referenceData.set(updatedReferenceData),
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

const MappedValue = ({value, onClick}) => {
    return <Button
        label={`${value}`}
        shape='pill'
        onClick={() => onClick && onClick()}
        tooltip={msg('Remove column value')}
    />
}
