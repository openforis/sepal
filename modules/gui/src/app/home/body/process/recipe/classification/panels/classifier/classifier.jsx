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
import {LegendItem} from '~/widget/legend/legendItem'
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

    lambda: new Form.Field()
        .skip((value, {type}) => type !== 'NAIVE_BAYES')
        .notBlank()
        .number()
        .greaterThan(0),
    decisionProcedure: new Form.Field(),
    svmType: new Form.Field(),
    kernelType: new Form.Field(),
    shrinking: new Form.Field(),
    degree: new Form.Field()
        .skip((value, {type}) => type !== 'SVM')
        .skip((value, {kernelType}) => kernelType !== 'POLY')
        .notBlank()
        .int()
        .min(1),
    gamma: new Form.Field()
        .skip((value, {type}) => type !== 'SVM')
        .skip((value, {kernelType}) => !['POLY', 'RBF', 'SIGMOID'].includes(kernelType))
        .number()
        .min(0),
    coef0: new Form.Field()
        .skip((value, {type}) => type !== 'SVM')
        .skip((value, {kernelType}) => !['POLY', 'SIGMOID'].includes(kernelType))
        .notBlank()
        .number(),
    cost: new Form.Field()
        .skip((value, {type}) => type !== 'SVM')
        .skip((value, {svmType}) => svmType !== 'C_SVC')
        .notBlank()
        .number()
        .greaterThan(0),
    nu: new Form.Field()
        .skip((value, {type}) => type !== 'SVM')
        .skip((value, {svmType}) => svmType !== 'NU_SVC')
        .notBlank()
        .number()
        .greaterThan(0)
        .skip((value, {type}) => type !== 'SVM')
        .max(1),
    oneClass: new Form.Field()
        .skip((value, {type}) => type !== 'SVM')
        .skip((value, {svmType}) => svmType !== 'ONE_CLASS')
        .notBlank(),
    metric: new Form.Field()
        .skip((value, {type}) => type !== 'MINIMUM_DISTANCE'),
    decisionTree: new Form.Field()
        .skip((value, {type}) => type !== 'DECISION_TREE')
        .notBlank(),
    tileScale: new Form.Field()
        .skip((value, {type}) => !['SVM', 'MINIMUM_DISTANCE'].includes(type))
        .notBlank()
        .number()
        .min(0.1)
        .max(16),
    normalize: new Form.Field(),
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
                case 'NAIVE_BAYES':
                    return renderNaiveBayes()
                case 'SVM':
                    return renderSvm()
                case 'MINIMUM_DISTANCE':
                    return renderMinimumDistance()
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

        const renderNaiveBayes = () =>
            null

        const renderSvm = () =>
            <>
                {this.renderDecisionProcedure()}
                {this.renderSvmType()}
                {this.renderKernelType()}
                {this.renderOneClass()}
            </>

        const renderMinimumDistance = () =>
            <>
                {this.renderMetric()}
            </>

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
        const {inputs: {type, svmType, kernelType}} = this.props

        const renderTypeForm = () => {
            switch (type.value) {
                case 'RANDOM_FOREST':
                    return renderRandomForest()
                case 'GRADIENT_TREE_BOOST':
                    return renderGradientTreeBoost()
                case 'CART':
                    return renderCart()
                case 'NAIVE_BAYES':
                    return renderNaiveBayes()
                case 'SVM':
                    return renderSvm()
                case 'MINIMUM_DISTANCE':
                    return renderMinimumDistance()
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
                {this.renderTileScale()}
            </div>

        const renderGradientTreeBoost = () =>
            <>
                <div className={styles.twoColumns}>
                    {this.renderNumberOfTrees()}
                    {this.renderShrinkage()}
                    {this.renderSamplingRate()}
                    {this.renderMaxNodes()}
                </div>
                {this.renderLoss()}
                <div className={styles.twoColumns}>
                    {this.renderSeed()}
                    {this.renderTileScale()}
                </div>
            </>

        const renderCart = () =>
            <>
                <div className={styles.twoColumns}>
                    {this.renderMinLeafPopulation()}
                    {this.renderMaxNodes()}
                </div>
                {this.renderTileScale()}
            </>

        const renderNaiveBayes = () =>
            <div className={styles.twoColumns}>
                {this.renderLambda()}
                {this.renderTileScale()}
            </div>

        const renderSvm = () =>
            <>
                {this.renderDecisionProcedure()}
                {this.renderSvmType()}
                {this.renderKernelType()}
                {this.renderShrinking()}
                {['C_SVC', 'NU_SVC'].includes(svmType.value) || ['POLY', 'RBF', 'SIGMOID'].includes(kernelType.value)
                    ? <div className={styles.twoColumns}>
                        {this.renderDegree()}
                        {this.renderGamma()}
                        {this.renderCoef0()}
                        {this.renderCost()}
                        {this.renderNu()}
                    </div>
                    : null}
                {this.renderOneClass()}
                <div className={styles.twoColumns}>
                    {this.renderNormalize()}
                    {this.renderTileScale()}
                </div>
            </>

        const renderMinimumDistance = () =>
            <>
                {this.renderMetric()}
                <div className={styles.twoColumns}>
                    {this.renderNormalize()}
                    {this.renderTileScale()}
                </div>
            </>

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
            {value: 'NAIVE_BAYES', label: msg('process.classification.panel.classifier.form.naiveBayes.label')},
            {value: 'SVM', label: msg('process.classification.panel.classifier.form.svm.label')},
            {
                value: 'MINIMUM_DISTANCE',
                label: msg('process.classification.panel.classifier.form.minimumDistance.label')
            },
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

    renderLambda() {
        const {inputs: {type, lambda}} = this.props
        if (type.value !== 'NAIVE_BAYES')
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.naiveBayes.config.lambda.label')}
                tooltip={msg('process.classification.panel.classifier.form.naiveBayes.config.lambda.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.naiveBayes.config.lambda.placeholder')}
                input={lambda}
            />
        )
    }

    renderDecisionProcedure() {
        const {inputs: {type, decisionProcedure}} = this.props
        if (type.value !== 'SVM')
            return
        const options = [
            {
                value: 'Voting',
                label: msg('process.classification.panel.classifier.form.svm.config.decisionProcedure.options.Voting.label')
            },
            {
                value: 'Margin',
                label: msg('process.classification.panel.classifier.form.svm.config.decisionProcedure.options.Margin.label')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.classification.panel.classifier.form.svm.config.decisionProcedure.label')}
                input={decisionProcedure}
                options={options}
            />
        )
    }

    renderSvmType() {
        const {legend, inputs: {type, svmType}} = this.props
        if (type.value !== 'SVM')
            return
        const options = [
            {
                value: 'C_SVC',
                label: msg('process.classification.panel.classifier.form.svm.config.svmType.options.C_SVC.label'),
                tooltip: msg('process.classification.panel.classifier.form.svm.config.svmType.options.C_SVC.tooltip')
            },
            {
                value: 'NU_SVC',
                label: msg('process.classification.panel.classifier.form.svm.config.svmType.options.NU_SVC.label'),
                tooltip: msg('process.classification.panel.classifier.form.svm.config.svmType.options.NU_SVC.tooltip')
            },
            {
                value: 'ONE_CLASS',
                label: msg('process.classification.panel.classifier.form.svm.config.svmType.options.ONE_CLASS.label'),
                tooltip: msg('process.classification.panel.classifier.form.svm.config.svmType.options.ONE_CLASS.tooltip'),
                disabled: legend.entries.length !== 2
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.classification.panel.classifier.form.svm.config.svmType.label')}
                tooltip={msg('process.classification.panel.classifier.form.svm.config.svmType.tooltip')}
                input={svmType}
                options={options}
            />
        )
    }

    renderKernelType() {
        const {inputs: {type, kernelType}} = this.props
        if (type.value !== 'SVM')
            return
        const options = [
            {
                value: 'LINEAR',
                label: msg('process.classification.panel.classifier.form.svm.config.kernelType.options.LINEAR.label'),
                tooltip: msg('process.classification.panel.classifier.form.svm.config.kernelType.options.LINEAR.tooltip')
            },
            {
                value: 'POLY',
                label: msg('process.classification.panel.classifier.form.svm.config.kernelType.options.POLY.label'),
                tooltip: msg('process.classification.panel.classifier.form.svm.config.kernelType.options.POLY.tooltip')
            },
            {
                value: 'RBF',
                label: msg('process.classification.panel.classifier.form.svm.config.kernelType.options.RBF.label'),
                tooltip: msg('process.classification.panel.classifier.form.svm.config.kernelType.options.RBF.tooltip')
            },
            {
                value: 'SIGMOID',
                label: msg('process.classification.panel.classifier.form.svm.config.kernelType.options.SIGMOID.label'),
                tooltip: msg('process.classification.panel.classifier.form.svm.config.kernelType.options.SIGMOID.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.classification.panel.classifier.form.svm.config.kernelType.label')}
                tooltip={msg('process.classification.panel.classifier.form.svm.config.kernelType.tooltip')}
                input={kernelType}
                options={options}
            />
        )
    }

    renderShrinking() {
        const {inputs: {type, shrinking}} = this.props
        if (type.value !== 'SVM')
            return
        const options = [
            {
                value: true,
                label: msg('process.classification.panel.classifier.form.svm.config.shrinking.options.yes.label')
            },
            {
                value: false,
                label: msg('process.classification.panel.classifier.form.svm.config.shrinking.options.no.label')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.classification.panel.classifier.form.svm.config.shrinking.label')}
                tooltip={msg('process.classification.panel.classifier.form.svm.config.shrinking.tooltip')}
                input={shrinking}
                options={options}
            />
        )
    }

    renderDegree() {
        const {inputs: {type, kernelType, degree}} = this.props
        if (type.value !== 'SVM' || kernelType.value !== 'POLY')
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.svm.config.degree.label')}
                tooltip={msg('process.classification.panel.classifier.form.svm.config.degree.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.svm.config.degree.placeholder')}
                input={degree}
            />
        )
    }

    renderGamma() {
        const {inputs: {type, kernelType, gamma}} = this.props
        if (type.value !== 'SVM' || !['POLY', 'RBF', 'SIGMOID'].includes(kernelType.value))
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.svm.config.gamma.label')}
                tooltip={msg('process.classification.panel.classifier.form.svm.config.gamma.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.svm.config.gamma.placeholder')}
                input={gamma}
            />
        )
    }

    renderCoef0() {
        const {inputs: {type, kernelType, coef0}} = this.props
        if (type.value !== 'SVM' || !['POLY', 'SIGMOID'].includes(kernelType.value))
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.svm.config.coef0.label')}
                tooltip={msg('process.classification.panel.classifier.form.svm.config.coef0.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.svm.config.coef0.placeholder')}
                input={coef0}
            />
        )
    }

    renderCost() {
        const {inputs: {type, svmType, cost}} = this.props
        if (type.value !== 'SVM' || svmType.value !== 'C_SVC')
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.svm.config.cost.label')}
                tooltip={msg('process.classification.panel.classifier.form.svm.config.cost.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.svm.config.cost.placeholder')}
                input={cost}
            />
        )
    }

    renderNu() {
        const {inputs: {type, svmType, nu}} = this.props
        if (type.value !== 'SVM' || svmType.value !== 'NU_SVC')
            return

        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.svm.config.nu.label')}
                tooltip={msg('process.classification.panel.classifier.form.svm.config.nu.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.svm.config.nu.placeholder')}
                input={nu}
            />
        )
    }

    renderOneClass() {
        const {legend, inputs: {type, svmType, oneClass}} = this.props
        if (type.value !== 'SVM' || svmType.value !== 'ONE_CLASS' || legend.entries.length !== 2)
            return

        const options = legend.entries.map(({color, label, value}) =>
            ({value, label, render: () => (
                <LegendItem color={color} label={label} value={value}/>
            )})
        )
        return (
            <Form.Combo
                label={msg('process.classification.panel.classifier.form.svm.config.oneClass.label')}
                placeholder={msg('process.classification.panel.classifier.form.svm.config.oneClass.placeholder')}
                input={oneClass}
                options={options}
            />
        )
    }

    renderMetric() {
        const {inputs: {type, metric}} = this.props
        if (type.value !== 'MINIMUM_DISTANCE')
            return
        const options = [
            {
                value: 'euclidean',
                label: msg('process.classification.panel.classifier.form.minimumDistance.config.metric.options.euclidean.label'),
                tooltip: msg('process.classification.panel.classifier.form.minimumDistance.config.metric.options.euclidean.tooltip')
            },
            {
                value: 'cosine',
                label: msg('process.classification.panel.classifier.form.minimumDistance.config.metric.options.cosine.label'),
                tooltip: msg('process.classification.panel.classifier.form.minimumDistance.config.metric.options.cosine.tooltip')
            },
            {
                value: 'mahalanobis',
                label: msg('process.classification.panel.classifier.form.minimumDistance.config.metric.options.mahalanobis.label'),
                tooltip: msg('process.classification.panel.classifier.form.minimumDistance.config.metric.options.mahalanobis.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.classification.panel.classifier.form.minimumDistance.config.metric.label')}
                tooltip={msg('process.classification.panel.classifier.form.minimumDistance.config.metric.tooltip')}
                input={metric}
                options={options}
            />
        )
    }

    renderDecisionTree() {
        const {inputs: {type, decisionTree}} = this.props
        if (type.value !== 'DECISION_TREE')
            return

        return (
            <>
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
            </>
        )
    }

    renderNormalize() {
        const {inputs: {normalize}} = this.props
        const options = [
            {value: 'YES', label: msg('process.classification.panel.classifier.form.normalize.YES.label'), tooltip: msg('process.classification.panel.classifier.form.normalize.YES.tooltip')},
            {value: 'NO', label: msg('process.classification.panel.classifier.form.normalize.NO.label'), tooltip: msg('process.classification.panel.classifier.form.normalize.NO.tooltip')},
        ]
        return (
            <Form.Buttons
                label={msg('process.classification.panel.classifier.form.normalize.label')}
                tooltip={msg('process.classification.panel.classifier.form.normalize.tooltip')}
                input={normalize}
                options={options}
            />
        )
    }

    renderTileScale() {
        const {inputs: {tileScale}} = this.props
        return (
            <Form.Input
                label={msg('process.classification.panel.classifier.form.tileScale.label')}
                tooltip={msg('process.classification.panel.classifier.form.tileScale.tooltip')}
                placeholder={msg('process.classification.panel.classifier.form.tileScale.placeholder')}
                input={tileScale}
            />
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
    loss: values.loss || 'LeastSquares',
    lambda: toFloat(values.lambda),
    decisionProcedure: values.decisionProcedure,
    svmType: values.svmType,
    kernelType: values.kernelType,
    shrinking: values.shrinking,
    degree: toInt(values.degree),
    gamma: toFloat(values.gamma),
    coef0: toFloat(values.coef0),
    cost: toFloat(values.cost),
    nu: toFloat(values.nu),
    oneClass: toInt(values.oneClass),
    metric: values.metric,
    decisionTree: values.decisionTree,
    normalize: values.normalize,
    tileScale: toFloat(values.tileScale) || 1,
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
    lambda: model.lambda,
    decisionProcedure: model.decisionProcedure,
    svmType: model.svmType,
    kernelType: model.kernelType,
    shrinking: model.shrinking,
    degree: model.degree,
    gamma: model.gamma,
    coef0: model.coef0,
    cost: model.cost,
    nu: model.nu,
    oneClass: model.oneClass,
    metric: model.metric,
    decisionTree: model.decisionTree,
    normalize: model.normalize || 'YES',
    tileScale: model.tileScale || 1,
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
