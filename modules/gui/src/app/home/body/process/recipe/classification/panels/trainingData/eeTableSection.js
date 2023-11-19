import {Form} from 'widget/form/form'
import {Subject, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import api from 'api'

class EETableSection extends Component {
    eeTableChanged$ = new Subject()

    render() {
        const {inputs: {eeTable}} = this.props
        return (
            <Form.AssetCombo
                label={msg('process.classification.panel.trainingData.form.eeTable.label')}
                autoFocus
                input={eeTable}
                placeholder={msg('process.classification.panel.trainingData.form.eeTable.placeholder')}
                allowedTypes={['Table']}
                errorMessage
                onChange={tableId => this.loadInputData(tableId)}
                busyMessage={this.props.stream('LOAD_EE_TABLE_ROWS').active && msg('widget.loading')}
            />
        )
    }

    componentDidMount() {
        const {inputs: {eeTable}} = this.props
        if (eeTable.value)
            this.loadInputData(eeTable.value)
    }

    loadInputData(tableId) {
        if (!tableId)
            return
        const {stream, inputs: {name, inputData, columns}} = this.props
        this.eeTableChanged$.next()
        name.set(null)
        inputData.set(null)
        columns.set(null)
        stream('LOAD_EE_TABLE_ROWS',
            api.gee.loadEETableRows$(tableId).pipe(
                takeUntil(this.eeTableChanged$)
            ),
            featureCollection => {
                name.set(tableId.substring(tableId.lastIndexOf('/') + 1))
                const loadedInputData = this.toInputData(featureCollection)
                inputData.set(loadedInputData)
                const loadedColumns = Object.keys(featureCollection.columns)
                columns.set(loadedInputData[0]['.geo']
                    ? [...loadedColumns, '.geo']
                    : loadedColumns
                )
            },
            error => {
                const {response: {defaultMessage, messageKey, messageArgs} = {}} = error
                this.props.inputs.eeTable.setInvalid(
                    messageKey
                        ? msg(messageKey, messageArgs, defaultMessage)
                        : msg('eeTable.failedToLoad')
                )
            }
        )
    }

    toInputData(featureCollection) {
        return featureCollection.features.map(feature =>
            feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates.length
                ? {'.geo': feature.geometry, ...feature.properties}
                : feature.properties)
    }
}

EETableSection.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.any
}

export default compose(
    EETableSection
)
