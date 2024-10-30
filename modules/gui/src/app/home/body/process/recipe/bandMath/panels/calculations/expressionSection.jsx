import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {CodeEditor} from '~/widget/codeEditor/codeEditor'
import {eeAutoComplete} from '~/widget/codeEditor/eeAutoComplete'
import {eeLint} from '~/widget/codeEditor/eeLint'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'

import {withRecipe} from '../../../../recipeContext'
import styles from './calculation.module.css'

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images') || [],
    calculations: selectFrom(recipe, 'model.calculations.calculations') || [],
})

class _ExpressionSection extends React.Component {
    constructor(props) {
        super(props)
        this.updateBands = this.updateBands.bind(this)
    }

    render() {
        const {inputs: {includedBands}} = this.props
        return (
            <Layout type='vertical'>
                <Layout type='horizontal' alignment='distribute'>
                    {this.renderName()}
                    {this.renderDataType()}
                </Layout>
                {this.renderExpression()}
                {includedBands.value.length === 1 && this.renderBandName()}
                {includedBands.value.length > 1 && this.renderBandNames()}
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

    renderDataType() {
        const {inputs: {dataType}} = this.props
        const options = [
            {value: 'auto', label: msg('process.bandMath.panel.calculations.form.dataType.auto')},
            {value: 'int8', label: msg('process.bandMath.panel.calculations.form.dataType.int8')},
            {value: 'int16', label: msg('process.bandMath.panel.calculations.form.dataType.int16')},
            {value: 'int32', label: msg('process.bandMath.panel.calculations.form.dataType.int32')},
            {value: 'int64', label: msg('process.bandMath.panel.calculations.form.dataType.int64')},
            {value: 'uint8', label: msg('process.bandMath.panel.calculations.form.dataType.uint8')},
            {value: 'uint16', label: msg('process.bandMath.panel.calculations.form.dataType.uint16')},
            {value: 'uint32', label: msg('process.bandMath.panel.calculations.form.dataType.uint32')},
            {value: 'byte', label: msg('process.bandMath.panel.calculations.form.dataType.byte')},
            {value: 'short', label: msg('process.bandMath.panel.calculations.form.dataType.short')},
            {value: 'int', label: msg('process.bandMath.panel.calculations.form.dataType.int')},
            {value: 'long', label: msg('process.bandMath.panel.calculations.form.dataType.long')},
            {value: 'float', label: msg('process.bandMath.panel.calculations.form.dataType.float')},
            {value: 'double', label: msg('process.bandMath.panel.calculations.form.dataType.double')},
        ]
        return (
            <Form.Combo
                label={msg('process.bandMath.panel.calculations.form.dataType.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.dataType.tooltip')}
                input={dataType}
                options={options}
                placeholder={msg('process.bandMath.panel.calculations.form.dataType.label')}
            />
        )
    }
    
    renderExpression() {
        const {images, calculations, inputs: {imageId, expression}} = this.props
        const calculationIndex = calculations.findIndex(calculation => calculation.imageId === imageId.value)
        const availableCalculations = calculationIndex >= 0
            ? calculations.slice(0, calculationIndex)
            : calculations

        const allImages = [...images, ...availableCalculations]
        return (
            <CodeEditor
                input={expression}
                autoComplete={eeAutoComplete(allImages, msg)}
                lint={eeLint(allImages, msg, this.updateBands)}
                autoFocus
            />
        )
    }
    
    renderBandName() {
        const {inputs: {bandName, defaultBandName}} = this.props
        return (
            <Form.Input
                label={msg('process.bandMath.panel.calculations.form.bandName.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.bandName.tooltip')}
                input={bandName}
                placeholder={defaultBandName.value || msg('process.bandMath.panel.calculations.form.bandName.placeholder')}
                autoComplete={false}
            />
        )
    }

    renderBandNames() {
        const {inputs: {bandRenameStrategy, regex, bandRename}} = this.props
        const options = [
            {value: 'PREFIX', label: msg('process.bandMath.panel.calculations.form.bandRenameStrategy.PREFIX.label')},
            {value: 'SUFFIX', label: msg('process.bandMath.panel.calculations.form.bandRenameStrategy.SUFFIX.label')},
            {value: 'REGEX', label: msg('process.bandMath.panel.calculations.form.bandRenameStrategy.REGEX.label')},
        ]
        return (
            (<Layout type='horizontal' alignment='distribute'>
                <Form.Combo
                    label={msg('process.bandMath.panel.calculations.form.bandRenameStrategy.label')}
                    tooltip={msg('process.bandMath.panel.calculations.form.bandRenameStrategy.tooltip')}
                    input={bandRenameStrategy}
                    options={options}
                    placeholder={'Select a strategy...'}
                />
                {bandRenameStrategy.value === 'REGEX'
                    ? (
                        <Form.Input
                            label={msg('process.bandMath.panel.calculations.form.regex.label')}
                            tooltip={msg('process.bandMath.panel.calculations.form.regex.tooltip')}
                            input={regex}
                            placeholder={msg('process.bandMath.panel.calculations.form.regex.placeholder')}
                            autoComplete={false}
                        />
                    ) : null}

                <Form.Input
                    label={msg(`process.bandMath.panel.calculations.form.bandRename.${bandRenameStrategy.value}.label`)}
                    tooltip={msg(`process.bandMath.panel.calculations.form.bandRename.${bandRenameStrategy.value}.tooltip`)}
                    input={bandRename}
                    placeholder={msg(`process.bandMath.panel.calculations.form.bandRename.${bandRenameStrategy.value}.placeholder`)}
                    autoComplete={false}
                />
            </Layout>)
        )
    }

    updateBands({usedBands, includedBands}) {
        const {inputs: {usedBands: usedBandsInput, includedBands: includedBandsInput, defaultBandName: defaultBandNameInput}} = this.props
        usedBandsInput.set(usedBands)
        includedBandsInput.set(includedBands)
        if (includedBands.length === 1) {
            defaultBandNameInput.set(includedBands[0].name)
        }
    }

    componentDidMount() {
        this.setBandRenameStrategy()
        this.setRegex()
    }

    setRegex() {
        const {inputs: {regex}} = this.props
        if (!regex.value) {
            regex.set('(.*)')
        }
    }

    setBandRenameStrategy() {
        const {inputs: {bandRenameStrategy}} = this.props
        if (!bandRenameStrategy.value) {
            bandRenameStrategy.set('SUFFIX')
        }
    }
}

export const ExpressionSection = compose(
    _ExpressionSection,
    withRecipe(mapRecipeToProps)
)

ExpressionSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
