import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {FileSelect} from '~/widget/fileSelect'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './classifier.module.css'

const mapRecipeToProps = recipe => ({
    legend: selectFrom(recipe, 'model.legend')
})

const fields = {
    advanced: new Form.Field(),
    type: new Form.Field(),
    numberOfTrees: new Form.Field()
        .skip((value, {type}) => !['RANDOM_FOREST', 'GRADIENT_TREE_BOOST'].includes(type))
        .notBlank()
        .int()
        .min(1),
    variablesPerSplit: new Form.Field()
        .skip((value, {type}) => type !== 'RANDOM_FOREST')
        .int()
        .min(1),
    minLeafPopulation: new Form.Field()
        .skip((value, {type}) => !['RANDOM_FOREST', 'CART'].includes(type))
        .notBlank()
        .int()
        .min(1),
    bagFraction: new Form.Field()
        .skip((value, {type}) => type !== 'RANDOM_FOREST')
        .notBlank()
        .number()
        .greaterThan(0)
        .max(1),
    maxNodes: new Form.Field()
        .skip((value, {type}) => !['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART'].includes(type))
        .int()
        .min(2)
        .max(2147483647),
    seed: new Form.Field()
        .skip((value, {type}) => !['RANDOM_FOREST', 'GRADIENT_TREE_BOOST'].includes(type))
        .notBlank()
        .int(),

    shrinkage: new Form.Field()
        .skip((value, {type}) => type !== 'GRADIENT_TREE_BOOST')
        .notBlank()
        .number()
        .greaterThan(0)
        .max(1),
    samplingRate: new Form.Field()
        .skip((value, {type}) => type !== 'GRADIENT_TREE_BOOST')
        .notBlank()
        .number()
        .greaterThan(0)
        .max(1),
    loss: new Form.Field()
        .skip((value, {type}) => type !== 'GRADIENT_TREE_BOOST')
        .notBlank(),

    decisionTree: new Form.Field()
        .skip((value, {type}) => type !== 'DECISION_TREE')
        .notBlank()
}

class _Classifier extends React.Component {
    render() {
        const {inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.classification.panel.classifier.title')}/>

                <Panel.Content>
                    {advanced.value ? this.renderAdvanced() : this.renderSimple()}
                </Panel.Content>

                <Form.PanelButtons>
                    <Button
                        label={advanced.value ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setAdvanced(!advanced.value)}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderSimple() {
        const {inputs: {type}} = this.props

        const renderTypeForm = () => {
            switch (type.value) {
                case 'RANDOM_FOREST':
                    return renderRandomForest()
                case 'GRADIENT_TREE_BOOST':
                    return renderGradientTreeBoost()
                case 'CART':
                    return renderCart()
                case 'DECISION_TREE':
                    return renderDecisionTree()
                default:
                    return
            }
        }
        const renderRandomForest = () =>
            <div className={styles.twoColumns}>
                {this.renderNumberOfTrees()}
            </div>

        const renderGradientTreeBoost = () =>
            <div className={styles.twoColumns}>
                {this.renderNumberOfTrees()}
            </div>

        const renderCart = () =>
            null

        const renderDecisionTree = () =>
            this.renderDecisionTree()

        return (
            <Layout>
                {this.renderType()}
                {renderTypeForm()}
            </Layout>
        )
    }

    renderAdvanced() {
        const {inputs: {type}} = this.props

        const renderTypeForm = () => {
            switch (type.value) {
                case 'RANDOM_FOREST':
                    return renderRandomForest()
                case 'GRADIENT_TREE_BOOST':
                    return renderGradientTreeBoost()
                case 'CART':
                    return renderCart()
                case 'DECISION_TREE':
                    return renderDecisionTree()
                default:
                    return
            }
        }

        const renderRandomForest = () =>
            <div className={styles.twoColumns}>
                {this.renderNumberOfTrees()}
                {this.renderVariablesPerSplit()}
                {this.renderMinLeafPopulation()}
                {this.renderBagFraction()}
                {this.renderMaxNodes()}
                {this.renderSeed()}
            </div>

        const renderGradientTreeBoost = () =>
            <React.Fragment>
                <div className={styles.twoColumns}>
                    {this.renderNumberOfTrees()}
                    {this.renderShrinkage()}
                    {this.renderSamplingRate()}
                    {this.renderMaxNodes()}
                </div>
                {this.renderLoss()}
                {this.renderSeed()}
            </React.Fragment>

        const renderCart = () =>
            <div className={styles.twoColumns}>
                {this.renderMinLeafPopulation()}
                {this.renderMaxNodes()}
            </div>

        const renderDecisionTree = () =>
            this.renderDecisionTree()

        return (
            <Layout>
                {this.renderType()}
                {renderTypeForm()}
            </Layout>
        )
    }

    renderType() {
        const {inputs: {type}} = this.props
        const options = [
            {value: 'RANDOM_FOREST', label: msg('process.classification.panel.classifier.form.randomForest.label')},
            {value: 'GRADIENT_TREE_BOOST', label: msg('process.classification.panel.classifier.form.gradientTreeBoost.label')},
            {value: 'CART', label: msg('process.classification.panel.classifier.form.cart.label')},
            {value: 'DECISION_TREE', label: msg('process.classification.panel.classifier.form.decisionTree.label')}
        ]
        return (
            <Form.Buttons
                label={msg('process.classification.panel.classifier.form.type.label')}
                input={type}
                options={options}
            />
        )
    }

    renderNumberOfTrees() {
        const {inputs: {type, numberOfTrees}} = this.props
        if (!['RANDOM_FOREST', 'GRADIENT_TREE_BOOST'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.randomForest.config.numberOfTrees.label')}
                tooltip={msg('process.classification.panel.classifier.form.randomForest.config.numberOfTrees.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.randomForest.config.numberOfTrees.placeholder')}
                input={numberOfTrees}
            />
        )
    }

    renderVariablesPerSplit() {
        const {inputs: {type, variablesPerSplit}} = this.props
        if (type.value !== 'RANDOM_FOREST')
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.randomForest.config.variablesPerSplit.label')}
                tooltip={msg('process.classification.panel.classifier.form.randomForest.config.variablesPerSplit.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.randomForest.config.variablesPerSplit.placeholder')}
                input={variablesPerSplit}
            />
        )
    }

    renderMinLeafPopulation() {
        const {inputs: {type, minLeafPopulation}} = this.props
        if (!['RANDOM_FOREST', 'CART'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.randomForest.config.minLeafPopulation.label')}
                tooltip={msg('process.classification.panel.classifier.form.randomForest.config.minLeafPopulation.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.randomForest.config.minLeafPopulation.placeholder')}
                input={minLeafPopulation}
            />
        )
    }

    renderBagFraction() {
        const {inputs: {type, bagFraction}} = this.props
        if (type.value !== 'RANDOM_FOREST')
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.randomForest.config.bagFraction.label')}
                tooltip={msg('process.classification.panel.classifier.form.randomForest.config.bagFraction.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.randomForest.config.bagFraction.placeholder')}
                input={bagFraction}
            />
        )
    }

    renderMaxNodes() {
        const {inputs: {type, maxNodes}} = this.props
        if (!['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.randomForest.config.maxNodes.label')}
                tooltip={msg('process.classification.panel.classifier.form.randomForest.config.maxNodes.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.randomForest.config.maxNodes.placeholder')}
                input={maxNodes}
            />
        )
    }

    renderSeed() {
        const {inputs: {type, seed}} = this.props
        if (!['RANDOM_FOREST', 'GRADIENT_TREE_BOOST'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.randomForest.config.seed.label')}
                tooltip={msg('process.classification.panel.classifier.form.randomForest.config.seed.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.randomForest.config.seed.placeholder')}
                input={seed}
            />
        )
    }

    renderShrinkage() {
        const {inputs: {type, shrinkage}} = this.props
        if (type.value !== 'GRADIENT_TREE_BOOST')
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.gradientTreeBoost.config.shrinkage.label')}
                tooltip={msg('process.classification.panel.classifier.form.gradientTreeBoost.config.shrinkage.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.gradientTreeBoost.config.shrinkage.placeholder')}
                input={shrinkage}
            />
        )
    }

    renderSamplingRate() {
        const {inputs: {type, samplingRate}} = this.props
        if (type.value !== 'GRADIENT_TREE_BOOST')
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.gradientTreeBoost.config.samplingRate.label')}
                tooltip={msg('process.classification.panel.classifier.form.gradientTreeBoost.config.samplingRate.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.gradientTreeBoost.config.samplingRate.placeholder')}
                input={samplingRate}
            />
        )
    }

    renderLoss() {
        const {inputs: {type, loss}} = this.props
        if (type.value !== 'GRADIENT_TREE_BOOST')
            return

        const options = [
            {
                value: 'LeastSquares',
                label: msg('process.classification.panel.classifier.form.gradientTreeBoost.config.loss.options.LeastSquares.label')
            },
            {
                value: 'LeastAbsoluteDeviation',
                label: msg('process.classification.panel.classifier.form.gradientTreeBoost.config.loss.options.LeastAbsoluteDeviation.label')
            },
            {
                value: 'Huber',
                label: msg('process.classification.panel.classifier.form.gradientTreeBoost.config.loss.options.Huber.label')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.classification.panel.classifier.form.gradientTreeBoost.config.loss.label')}
                input={loss}
                options={options}
            />
        )
    }

    renderDecisionTree() {
        const {inputs: {type, decisionTree}} = this.props
        if (type.value !== 'DECISION_TREE')
            return

        return (
            <React.Fragment>
                <Form.Input
                    label={msg('process.classification.panel.classifier.form.decisionTree.label')}
                    tooltip={msg('process.classification.panel.classifier.form.decisionTree.tooltip')}
                    placeholder={msg('process.classification.panel.classifier.form.decisionTree.placeholder')}
                    input={decisionTree}
                    textArea
                />
                <FileSelect
                    single
                    onSelect={file => file.text().then(text => decisionTree.set(text))}
                />
            </React.Fragment>
        )
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }
}

const valuesToModel = values => ({
    type: values.type,
    numberOfTrees: toInt(values.numberOfTrees),
    variablesPerSplit: toInt(values.variablesPerSplit),
    minLeafPopulation: toInt(values.minLeafPopulation),
    bagFraction: toFloat(values.bagFraction),
    maxNodes: toInt(values.maxNodes),
    seed: toInt(values.seed),
    shrinkage: toFloat(values.shrinkage) || 0.05,
    samplingRate: toFloat(values.samplingRate) || 0.7,
    decisionTree: values.decisionTree
})

const modelToValues = model => ({
    type: model.type,
    numberOfTrees: model.numberOfTrees,
    variablesPerSplit: model.variablesPerSplit,
    minLeafPopulation: model.minLeafPopulation,
    bagFraction: model.bagFraction,
    maxNodes: model.maxNodes,
    seed: model.seed,
    shrinkage: model.shrinkage || 0.05,
    samplingRate: model.samplingRate || 0.7,
    loss: model.loss || 'LeastSquares',
    decisionTree: model.decisionTree
})

const toInt = input => {
    input = _.isString(input) ? input : _.toString(input)
    const parsed = parseInt(input)
    return _.isFinite(parsed) ? parsed : null
}

const toFloat = input => {
    input = _.isString(input) ? input : _.toString(input)
    const parsed = parseFloat(input)
    return _.isFinite(parsed) ? parsed : null
}

export const Classifier = compose(
    _Classifier,
    recipeFormPanel({id: 'classifier', fields, valuesToModel, modelToValues, mapRecipeToProps})
)

Classifier.propTypes = {
    recipeId: PropTypes.string
}
