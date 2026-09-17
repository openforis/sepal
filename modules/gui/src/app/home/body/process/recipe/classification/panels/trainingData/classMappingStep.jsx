import _ from 'lodash'
import PropTypes from 'prop-types'
import React, {Component} from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {ButtonPopup} from '~/widget/buttonPopup'
import {Combo} from '~/widget/combo'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {Icon} from '~/widget/icon'
import {Input} from '~/widget/input'
import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'
import {LegendItem} from '~/widget/legend/legendItem'
import {ListItem} from '~/widget/listItem'

import styles from './classStep.module.css'
import {filterReferenceData$, remapReferenceData$} from './inputData'
import {SAMPLEABLE_TYPES} from './sampleableTypes'

const mapRecipeToProps = recipe => ({
    legend: selectFrom(recipe, 'model.legend'),
    recipe
})

class _ClassMappingStep extends Component {
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
                {this.renderTrainingDataRefinement()}
            </Layout>
        )
    }

    renderTrainingDataRefinement() {
        const {more, inputs: {type, sampleMode}} = this.props
        if (!SAMPLEABLE_TYPES.includes(type.value) || !more) {
            return null
        }
        return (
            <Layout className={styles.trainingDataRefinement}>
                <Label msg={msg('process.classification.panel.trainingData.classMapping.trainingDataRefinement.title')}/>
                <Form.Buttons
                    label={msg('process.classification.panel.trainingData.classMapping.sampleMode.label')}
                    input={sampleMode}
                    multiple={false}
                    options={[
                        {
                            value: 'PERCENTAGE',
                            label: msg('process.classification.panel.trainingData.classMapping.sampleMode.PERCENTAGE.label')
                        },
                        {
                            value: 'CUSTOM_NUMBER',
                            label: msg('process.classification.panel.trainingData.classMapping.sampleMode.CUSTOM_NUMBER.label')
                        }
                    ]}
                />
                {sampleMode.value === 'CUSTOM_NUMBER'
                    ? this.renderSampleCountByClass()
                    : this.renderSamplePercentage()}
            </Layout>
        )
    }

    renderSamplePercentage() {
        const {inputs: {samplePercentage}} = this.props
        return (
            <Form.Slider
                label={msg('process.classification.panel.trainingData.classMapping.samplePercentage.label')}
                tooltip={msg('process.classification.panel.trainingData.classMapping.samplePercentage.tooltip')}
                input={samplePercentage}
                minValue={1}
                maxValue={100}
                ticks={[1, 25, 50, 75, 100]}
                range='low'
                info={percentage =>
                    msg('process.classification.panel.trainingData.classMapping.samplePercentage.value', {percentage})
                }
            />
        )
    }

    renderSampleCountByClass() {
        const {legend, inputs: {sampleCountByClass}} = this.props
        const countByClass = sampleCountByClass.value || {}
        return (
            <Layout spacing='compact'>
                {legend.entries.map(({id, value, label, color}) =>
                    <Layout
                        key={id}
                        type='horizontal-nowrap'
                        spacing='compact'
                        className={styles.sampleCountRow}>
                        <LegendItem color={color} label={label} value={value}/>
                        <Layout.Spacer/>
                        <Input
                            className={styles.sampleCount}
                            type='number'
                            placeholder={msg('process.classification.panel.trainingData.classMapping.sampleCountByClass.placeholder')}
                            value={countByClass[value] ?? ''}
                            onChange={e => this.setSampleCountForClass(value, e.target.value)}
                        />
                    </Layout>
                )}
            </Layout>
        )
    }

    setSampleCountForClass(legendValue, rawValue) {
        const {inputs: {sampleCountByClass}} = this.props
        const countByClass = {...(sampleCountByClass.value || {})}
        const count = parseInt(rawValue)
        if (rawValue === '' || !_.isFinite(count)) {
            delete countByClass[legendValue]
        } else {
            countByClass[legendValue] = count
        }
        sampleCountByClass.set(countByClass)
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
                hPlacement='over-left-or-over-right'
                tooltip={msg('process.classification.panel.trainingData.classMapping.addColumns.tooltip')}>
                {onBlur => (
                    <Combo
                        alignment='left'
                        placeholder={msg('process.classification.panel.trainingData.classMapping.addColumns.placeholder')}
                        options={valueOptions}
                        hPlacement='over-left-or-over-right'
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
        const {stream, inputs: {referenceData, type, sampleMode, samplePercentage, sampleCountByClass}} = this.props
        const active = stream('UPDATE_REFERENCE_DATA').active
        const total = referenceData.value ? (referenceData.value.counts[legendValue] || 0) : null
        const sampled = this.sampledCount(total, legendValue, {
            type: type.value,
            sampleMode: sampleMode.value,
            samplePercentage: samplePercentage.value,
            sampleCountByClass: sampleCountByClass.value
        })
        return (
            <div className={styles.count}>
                {active
                    ? <Icon name='spinner'/>
                    : total !== null
                        ? (sampled !== null ? `${sampled} / ${total}` : total)
                        : null
                }
            </div>
        )
    }

    sampledCount(total, legendValue, {type, sampleMode, samplePercentage, sampleCountByClass}) {
        if (total === null || !SAMPLEABLE_TYPES.includes(type)) {
            return null
        }
        if (sampleMode === 'CUSTOM_NUMBER') {
            const maxCount = (sampleCountByClass || {})[legendValue]
            return _.isFinite(maxCount) ? Math.min(total, maxCount) : null
        }
        return _.isFinite(samplePercentage) && samplePercentage < 100
            ? Math.round(total * samplePercentage / 100)
            : null
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

export const ClassMappingStep = compose(
    _ClassMappingStep,
    withRecipe(mapRecipeToProps)
)

ClassMappingStep.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.any,
    more: PropTypes.bool
}
