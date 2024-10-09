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
    state = {bandOptions: []}

    constructor(props) {
        super(props)
        this.updateUsedBands = this.updateUsedBands.bind(this)
    }

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
        const {inputs: {usedBandIds}} = this.props
        const {bandOptions} = this.state
        return (
            <Form.Buttons
                label={msg('process.bandMath.panel.calculations.form.usedBands.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.usedBands.label')}
                input={usedBandIds}
                multiple
                options={bandOptions}
                framed
                onChange={this.updateUsedBands}
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
                autoFocus
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

    componentDidMount() {
        const {images, calculations, inputs: {imageId}} = this.props
        const calculationIndex = calculations.findIndex(calculation => calculation.imageId === imageId.value)
        const availableCalculations = calculationIndex >= 0
            ? calculations.slice(0, calculationIndex)
            : calculations
        const imageOptions = images.map(image => ({
            label: image.name,
            options: image.includedBands.map(band => ({
                value: band.id,
                label: band.name,
                band: {...band, imageId: image.imageId, imageName: image.name}
            }))
        }))
        const calculationOptions = availableCalculations.map(calculation => ({
            label: calculation.name,
            options: calculation.includedBands.map(band => ({
                value: band.id,
                label: band.name,
                band: {...band, imageId: calculation.imageId, imageName: calculation.name}
            }))
        }))
        const bandOptions = [...imageOptions, ...calculationOptions]
        this.setState({bandOptions})
    }

    updateUsedBands(bandIds) {
        const {inputs: {usedBands}} = this.props
        const {bandOptions} = this.state

        const bands = bandOptions
            .map(({options}) => options)
            .flat()
            .filter(({value}) => bandIds.includes(value))
            .map(({band}) => band)
        usedBands.set(bands)
    }
}

export const FunctionSection = compose(
    _FunctionSection,
    withRecipe(mapRecipeToProps)
)

FunctionSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
