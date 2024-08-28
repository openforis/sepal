import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'
import {FormCombo} from 'widget/form/combo'
import {Layout} from 'widget/layout'

import api from '~/apiRegistry'
import {msg} from '~/translate'
import {Form} from '~/widget/form'

export class EETableSection extends React.Component {
    cancel$ = new Subject()
    state = {columns: []}

    render() {
        return (
            <Layout>
                {this.renderTableSelection()}
                {this.renderValueColumnSelection()}
            </Layout>
        )
    }

    renderTableSelection() {
        const {inputs: {eeTable}} = this.props
        return (
            <Form.AssetCombo
                label={msg('process.classification.panel.trainingData.form.eeTable.label')}
                autoFocus
                input={eeTable}
                placeholder={msg('process.classification.panel.trainingData.form.eeTable.placeholder')}
                allowedTypes={['Table']}
                onLoading={() => this.setState({columns: []})}
                onChange={eeTable => this.loadColumns(eeTable)}
                busyMessage={this.props.stream('LOAD_EE_TABLE_COLUMNS').active && msg('widget.loading')}
            />
        )
    }

    renderValueColumnSelection() {
        const {inputs: {valueColumn}} = this.props
        const {columns} = this.state
        const options = columns
            .map(column => ({value: column, label: column}))
        return (
            <FormCombo
                input={valueColumn}
                disabled={!columns.length}
                options={options}
                label={msg('process.regression.panel.trainingData.form.eeTable.valueColumn.label')}
                placeholder={msg('process.regression.panel.trainingData.form.eeTable.valueColumn.placeholder')}
                tooltip={msg('process.regression.panel.trainingData.form.eeTable.valueColumn.tooltip')}
                busyMessage={this.props.stream('LOAD_EE_TABLE_ROWS').active && msg('widget.loading')}
                onChange={({value}) =>
                    this.loadData({
                        eeTable: this.props.inputs.eeTable.value,
                        column: value
                    })}
            />
        )
    }

    componentDidMount() {
        const {inputs: {eeTable, valueColumn, name, referenceData}} = this.props
        this.setState({columns: []})
        name.set(null)
        referenceData.set(null)
        this.loadColumns(eeTable.value)
        this.loadData({eeTable: eeTable.value, column: valueColumn.value})
    }

    loadColumns(eeTable) {
        const {inputs: {name, referenceData}} = this.props
        this.setState({column: []})
        name.set(null)
        referenceData.set(null)
        this.props.inputs.eeTable.setInvalid() // Reset any eventual error
        this.props.stream('LOAD_EE_TABLE_COLUMNS',
            api.gee.loadEETableColumns$(eeTable),
            columns => this.setState({columns}),
            error => {
                const response = error.response || {}
                const {defaultMessage, messageKey, messageArgs} = response
                this.props.inputs.eeTable.setInvalid(
                    messageKey
                        ? msg(messageKey, messageArgs, defaultMessage)
                        : msg('eeTable.failedToLoad')
                )
            }
        )
    }

    loadData({eeTable, column}) {
        if (!eeTable || !column)
            return
        const {stream, inputs: {name, referenceData, valueColumn}} = this.props
        this.cancel$.next()
        name.set(null)
        referenceData.set(null)
        this.props.inputs.eeTable.setInvalid() // Reset any eventual error
        stream('LOAD_EE_TABLE_ROWS',
            api.gee.loadEETableRows$(eeTable, [column]).pipe(
                takeUntil(this.cancel$)
            ),
            featureCollection => {
                name.set(eeTable.substring(eeTable.lastIndexOf('/') + 1))
                const referenceDataValue = this.toReferenceData({featureCollection, column})
                referenceData.set(referenceDataValue)
                if (!column) {
                    valueColumn.set(Object.keys(featureCollection.columns)[0])
                }
            },
            error => {
                const response = error.response || {}
                const {defaultMessage, messageKey, messageArgs} = response
                this.props.inputs.valueColumn.setInvalid(
                    messageKey
                        ? msg(messageKey, messageArgs, defaultMessage)
                        : msg('eeTable.failedToLoad')
                )
            }
        )
    }

    toReferenceData({featureCollection, column}) {
        return featureCollection.features.map(feature => {
            const [x, y] = feature.geometry.coordinates
            return {x, y, value: feature.properties[column]}
        })
    }
}

EETableSection.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.any
}
