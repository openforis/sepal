import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'

import {withRecipe} from '../../../../recipeContext'
import styles from './calculation.module.css'

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images') || [],
    calculations: selectFrom(recipe, 'model.calculations.calculations') || [],
})

class _FunctionSection extends React.Component {
    render() {
        return (
            <Layout type='vertical'>
                {this.renderName()}
                <Layout type='horizontal' alignment='distribute'>
                    {this.renderReducer()}
                    {this.renderBandName()}
                </Layout>
                {this.renderBands()}
            </Layout>
        )
    }

    // Band selection - sections of buttons
    // Function - combo
    // Band name - input text

    renderName() {
        const {inputs: {name}} = this.props
        return (
            <Form.Input
                className={styles.name}
                label={msg('process.bandMath.panel.calculations.form.calculationName.label')}
                placeholder={msg('process.bandMath.panel.calculations.form.calculationName.placeholder')}
                tooltip={msg('process.bandMath.panel.calculations.form.calculationName.tooltip')}
                input={name}
                autoComplete={false}
            />
        )
    }

    renderBands() {
        const {images, calculations, inputs: {calculationId, bands}} = this.props
        const calculationIndex = calculations.findIndex(calculation => calculation.calculationId === calculationId.value)
        const availableCalculations = calculationIndex >= 0
            ? calculations.slice(0, calculationIndex)
            : calculations
        const imageOptions = images.map(image => ({
            label: image.name,
            options: image.includedBands.map(({id, band}) => ({
                value: id,
                label: band
            }))
        }))
        const calculationOptions = availableCalculations.map(calculation => ({
            label: calculation.name,
            options: [{
                value: calculation.calculationId,
                label: calculation.bandName
            }]
        }))
        return (
            <Form.Buttons
                label={msg('process.bandMath.panel.calculations.form.bands.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.bands.label')}
                input={bands}
                multiple
                options={[...imageOptions, ...calculationOptions]}
                framed
            />
        )
    }

    renderReducer() {
        const {inputs: {reducer}} = this.props
        const options = [
            {key: '0', options: [
                {value: 'sum', label: 'sum'},
                {value: 'product', label: 'product'},
            ]},
            {key: '1', options: [
                {value: 'max', label: 'max'},
                {value: 'min', label: 'min'},
            ]},
            {key: '2', options: [
                {value: 'mean', label: 'mean'},
                {value: 'median', label: 'median'},
                {value: 'mode', label: 'mode'},
            ]},
            {key: '3', options: [
                {value: 'stdDev', label: 'stdDev'},
                {value: 'variance', label: 'variance'},
            ]},
            {key: '4', options: [
                {value: 'firstNonNull', label: 'first'},
                {value: 'lastNonNull', label: 'last'},
            ]},
            {key: '5', options: [
                {value: 'count', label: 'count'},
                {value: 'countDistinctNonNull', label: 'countDistinctNonNull'},
            ]}
        ]
        return (
            <Form.Combo
                label={msg('process.bandMath.panel.calculations.form.function.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.function.tooltip')}
                input={reducer}
                options={options}
                placeholder={'Select function...'}
            />
        )
    }

    renderBandName() {
        const {inputs: {bandName}} = this.props
        return (
            <Form.Input
                label={msg('process.bandMath.panel.calculations.form.bandName.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.bandName.tooltip')}
                input={bandName}
                placeholder={msg('process.bandMath.panel.calculations.form.bandName.placeholder')}
                autoComplete={false}
            />
        )
    }
}

export const FunctionSection = compose(
    _FunctionSection,
    withRecipe(mapRecipeToProps)
)

FunctionSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
