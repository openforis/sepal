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
import {determineUsedBands} from './expressionParser'

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images') || [],
    calculations: selectFrom(recipe, 'model.calculations.calculations') || [],
})

class _ExpressionSection extends React.Component {
    constructor(props) {
        super(props)
        this.updateUsedBands = this.updateUsedBands.bind(this)
    }

    render() {
        return (
            <Layout type='vertical'>
                {this.renderName()}
                {this.renderExpression()}
                {this.renderBandName()}
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
    
    renderExpression() {
        const {images, calculations, inputs: {expression}} = this.props
        const allImages = [...images, ...calculations]
        return (
            <CodeEditor
                input={expression}
                autoComplete={eeAutoComplete(allImages, msg)}
                lint={eeLint(allImages, msg)}
                onChange={this.updateUsedBands}
            />
        )
    }
    
    // TODO: We might have more than one band if whole image is used in expression
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

    updateUsedBands(expression) {
        const {images, calculations, inputs: {usedBands}} = this.props
        try {
            const bands = determineUsedBands({expression, images, calculations})
            usedBands.set(bands)
        } catch (error) {
            // console.log(error)
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
