import {Form} from 'widget/form'
import {Layout} from 'widget/layout'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React, {Component} from 'react'

const mapRecipeToProps = recipe => ({
    legend: selectFrom(recipe, 'model.legend')
})

class _LocationStep extends Component {
    render() {
        const {inputs: {columns}} = this.props
        const columnOptions = columns.value.map(column => ({value: column, label: column}))
        return (
            <Layout>
                {this.renderLocationType()}
                {this.renderGeoJSON(columnOptions)}
                {this.renderXY(columnOptions)}
            </Layout>
        )
    }

    renderLocationType() {
        const {inputs: {locationType}} = this.props
        const locationTypeOptions = [
            {
                value: 'XY_COLUMNS',
                label: msg(['process.classification.panel.trainingData.form.location.locationType.XY_COLUMNS.label']),
                tooltip: msg(['process.classification.panel.trainingData.form.location.locationType.XY_COLUMNS.tooltip'])
            },
            {
                value: 'GEO_JSON',
                label: msg(['process.classification.panel.trainingData.form.location.locationType.GEO_JSON.label']),
                tooltip: msg(['process.classification.panel.trainingData.form.location.locationType.GEO_JSON.tooltip'])
            }
        ]
        return <Form.Buttons
            label={msg(['process.classification.panel.trainingData.form.location.locationType.label'])}
            input={locationType}
            options={locationTypeOptions}/>
    }

    renderGeoJSON(columnOptions) {
        const {inputs: {locationType, geoJsonColumn}} = this.props
        return locationType.value === 'GEO_JSON'
            ? <Form.Combo
                label={msg('process.classification.panel.trainingData.form.location.geoJson.label')}
                input={geoJsonColumn}
                disabled={locationType.value !== 'GEO_JSON'}
                placeholder={msg('process.classification.panel.trainingData.form.location.geoJson.placeholder')}
                options={columnOptions}
            />
            : null
    }

    renderXY(columnOptions) {
        const {inputs: {locationType, xColumn, yColumn}} = this.props
        return locationType.value === 'XY_COLUMNS'
            ? <React.Fragment>
                <Form.Combo
                    label={msg('process.classification.panel.trainingData.form.location.xColumn.label')}
                    input={xColumn}
                    disabled={locationType.value !== 'XY_COLUMNS'}
                    placeholder={msg('process.classification.panel.trainingData.form.location.xColumn.placeholder')}
                    options={columnOptions}
                />
                <Form.Combo
                    label={msg('process.classification.panel.trainingData.form.location.yColumn.label')}
                    input={yColumn}
                    disabled={locationType.value !== 'XY_COLUMNS'}
                    placeholder={msg('process.classification.panel.trainingData.form.location.yColumn.placeholder')}
                    options={columnOptions}
                />
            </React.Fragment>
            : null
    }

    componentDidMount() {
        const {inputs: {locationType, geoJsonColumn, xColumn, yColumn}} = this.props
        if (locationType.value)
            return // Already initialized
        if (this.containsColumns('.geo')) { // Earth Engine
            locationType.set('GEO_JSON')
            geoJsonColumn.set('.geo')
        } else if (this.containsColumns('CENTER_LON', 'CENTER_LAT')) { // Collect Earth Online
            locationType.set('XY_COLUMNS')
            xColumn.set('CENTER_LON')
            yColumn.set('CENTER_LAT')
        } else if (this.containsColumns('XCoordinate', 'YCoordinate')) { // Collect
            locationType.set('XY_COLUMNS')
            xColumn.set('XCoordinate')
            yColumn.set('YCoordinate')
        } else if (this.containsColumns('location_x', 'location_y')) { // Collect Earth
            locationType.set('XY_COLUMNS')
            xColumn.set('location_x')
            yColumn.set('location_y')
        } else {
            locationType.set('XY_COLUMNS')
        }
    }

    containsColumns(...columnNames) {
        const {inputs: {columns}} = this.props
        return columnNames.every(columnName => columns.value.includes(columnName))
    }
}

export const LocationStep = compose(
    _LocationStep,
    withRecipe(mapRecipeToProps)
)

LocationStep.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.any
}
