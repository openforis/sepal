import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './clusterer.module.css'

const mapRecipeToProps = recipe => ({
    legend: selectFrom(recipe, 'model.legend')
})

const fields = {
    advanced: new Form.Field(),
    type: new Form.Field(),
    numberOfClusters: new Form.Field()
        .skip((value, {type}) => !['KMEANS', 'LVQ'].includes(type))
        .notBlank()
        .int()
        .min(2),
    minNumberOfClusters: new Form.Field()
        .skip((value, {type}) => !['CASCADE_KMEANS', 'XMEANS'].includes(type))
        .notBlank()
        .int()
        .min(1),
    maxNumberOfClusters: new Form.Field()
        .skip((value, {type}) => !['CASCADE_KMEANS', 'XMEANS'].includes(type))
        .notBlank()
        .int()
        .min(2),
    restarts: new Form.Field()
        .skip((value, {type}) => !['CASCADE_KMEANS'].includes(type))
        .notBlank()
        .int()
        .min(0),
    init: new Form.Field()
        .skip((value, {type}) => !['CASCADE_KMEANS', 'KMEANS'].includes(type))
        .notBlank()
        .int()
        .min(0)
        .max(3),
    distanceFunction: new Form.Field()
        .skip((value, {type}) => !['CASCADE_KMEANS', 'KMEANS', 'XMEANS'].includes(type))
        .notBlank(),
    maxIterations: new Form.Field()
        .skip((value, {type}) => !['CASCADE_KMEANS', 'KMEANS'].includes(type))
        .int()
        .min(1)
        .max(2147483647),
    canopies: new Form.Field()
        .skip((value, {type}) => !['KMEANS'].includes(type)),
    maxCandidates: new Form.Field()
        .skip((value, {type}) => !['KMEANS'].includes(type))
        .int()
        .min(1)
        .max(2147483647),
    periodicPruning: new Form.Field()
        .skip((value, {type}) => !['KMEANS'].includes(type))
        .int()
        .min(0)
        .max(2147483647),
    minDensity: new Form.Field()
        .skip((value, {type}) => !['KMEANS'].includes(type))
        .int()
        .min(0)
        .max(2147483647),
    t1: new Form.Field()
        .skip((value, {type}) => !['KMEANS'].includes(type))
        .number(),
    t2: new Form.Field()
        .skip((value, {type}) => !['KMEANS'].includes(type))
        .number(),
    preserveOrder: new Form.Field()
        .skip((value, {type}) => !['KMEANS'].includes(type)),
    fast: new Form.Field()
        .skip((value, {type}) => !['KMEANS'].includes(type)),
    seed: new Form.Field()
        .skip((value, {type}) => !['KMEANS', 'XMEANS'].includes(type))
        .int(),
    learningRate: new Form.Field()
        .skip((value, {type}) => !['LVQ'].includes(type))
        .number()
        .greaterThan(0)
        .max(1),
    epochs: new Form.Field()
        .skip((value, {type}) => !['LVQ'].includes(type))
        .int()
        .min(1)
        .max(2147483647),
    normalizeInput: new Form.Field()
        .skip((value, {type}) => !['LVQ'].includes(type)),
    maxIterationsOverall: new Form.Field()
        .skip((value, {type}) => !['XMEANS'].includes(type))
        .int()
        .min(1)
        .max(2147483647),
    maxKMeans: new Form.Field()
        .skip((value, {type}) => !['XMEANS'].includes(type))
        .int()
        .min(1)
        .max(2147483647),
    maxForChildren: new Form.Field()
        .skip((value, {type}) => !['XMEANS'].includes(type))
        .int()
        .min(1)
        .max(2147483647),
    useKD: new Form.Field()
        .skip((value, {type}) => !['XMEANS'].includes(type)),
    cutoffFactor: new Form.Field()
        .skip((value, {type}) => !['XMEANS'].includes(type))
        .number()
}

class _Clusterer extends React.Component {
    render() {
        const {inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.unsupervisedClassification.panel.clusterer.title')}/>

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
                case 'CASCADE_KMEANS':
                    return renderCascadeKMeans()
                case 'KMEANS':
                    return renderKMeans()
                case 'LVQ':
                    return renderLVQ()
                case 'XMEANS':
                    return renderXMeans()
                default:
                    return
            }
        }
        const renderCascadeKMeans = () =>
            <div className={styles.twoColumns}>
                {this.renderMinNumberOfClusters()}
                {this.renderMaxNumberOfClusters()}
            </div>

        const renderKMeans = () =>
            <div className={styles.twoColumns}>
                {this.renderNumberOfClusters()}
            </div>

        const renderLVQ = () =>
            <div className={styles.twoColumns}>
                {this.renderNumberOfClusters()}
            </div>

        const renderXMeans = () =>
            <div className={styles.twoColumns}>
                {this.renderMinNumberOfClusters()}
                {this.renderMaxNumberOfClusters()}
            </div>

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
                case 'CASCADE_KMEANS':
                    return renderCascadeKMeans()
                case 'KMEANS':
                    return renderKMeans()
                case 'LVQ':
                    return renderLVQ()
                case 'XMEANS':
                    return renderXMeans()
                default:
                    return
            }
        }

        const renderCascadeKMeans = () =>
            <>
                <div className={styles.twoColumns}>
                    {this.renderMinNumberOfClusters()}
                    {this.renderMaxNumberOfClusters()}
                    {this.renderRestarts()}
                    {this.renderMaxIterations()}
                </div>
                {this.renderInit()}
                {this.renderDistanceFunction()}
            </>

        const renderKMeans = () =>
            <>
                <div className={styles.twoColumns}>
                    {this.renderNumberOfClusters()}
                    {this.renderMaxCandidates()}
                    {this.renderPeriodicPruning()}
                    {this.renderMinDensity()}
                    {this.renderT1()}
                    {this.renderT2()}
                    {this.renderMaxIterations()}
                    {this.renderSeed()}
                </div>
                {this.renderDistanceFunction()}
                {this.renderPreserveOrder()}
                {this.renderFast()}
                {this.renderInit()}
                {this.renderCanopies()}
            </>

        const renderLVQ = () =>
            <>
                <div className={styles.twoColumns}>
                    {this.renderNumberOfClusters()}
                    {this.renderLearningRate()}
                    {this.renderEpochs()}
                </div>
                {this.renderNormalizeInput()}
            </>

        const renderXMeans = () =>
            <>
                <div className={styles.twoColumns}>
                    {this.renderMinNumberOfClusters()}
                    {this.renderMaxNumberOfClusters()}
                    {this.renderMaxIterationsOverall()}
                    {this.renderMaxKMeans()}
                    {this.renderMaxForChildren()}
                    {this.renderCutoffFactor()}
                    {this.renderSeed()}
                </div>
                {this.renderUseKD()}
                {this.renderDistanceFunction()}
            </>

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
            {value: 'KMEANS', label: msg('process.unsupervisedClassification.panel.clusterer.form.kmeans.label'), tooltip: msg('process.unsupervisedClassification.panel.clusterer.form.kmeans.tooltip')},
            {value: 'CASCADE_KMEANS', label: msg('process.unsupervisedClassification.panel.clusterer.form.cascadeKMeans.label'), tooltip: msg('process.unsupervisedClassification.panel.clusterer.form.cascadeKMeans.tooltip')},
            {value: 'XMEANS', label: msg('process.unsupervisedClassification.panel.clusterer.form.xmeans.label'), tooltip: msg('process.unsupervisedClassification.panel.clusterer.form.xmeans.tooltip')},
            {value: 'LVQ', label: msg('process.unsupervisedClassification.panel.clusterer.form.lvq.label'), tooltip: msg('process.unsupervisedClassification.panel.clusterer.form.lvq.tooltip')},
        ]
        return (
            <Form.Buttons
                label={msg('process.unsupervisedClassification.panel.clusterer.form.type.label')}
                input={type}
                options={options}
            />
        )
    }

    renderNumberOfClusters() {
        const {inputs: {type, numberOfClusters}} = this.props
        if (!['KMEANS', 'LVQ'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.numberOfClusters.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.numberOfClusters.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.numberOfClusters.placeholder')}
                input={numberOfClusters}
            />
        )
    }

    renderMinNumberOfClusters() {
        const {inputs: {type, minNumberOfClusters}} = this.props
        if (!['CASCADE_KMEANS', 'XMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.minNumberOfClusters.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.minNumberOfClusters.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.minNumberOfClusters.placeholder')}
                input={minNumberOfClusters}
            />
        )
    }

    renderMaxNumberOfClusters() {
        const {inputs: {type, maxNumberOfClusters}} = this.props
        if (!['CASCADE_KMEANS', 'XMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxNumberOfClusters.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxNumberOfClusters.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxNumberOfClusters.placeholder')}
                input={maxNumberOfClusters}
            />
        )
    }

    renderRestarts() {
        const {inputs: {type, restarts}} = this.props
        if (!['CASCADE_KMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.restarts.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.restarts.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.restarts.placeholder')}
                input={restarts}
            />
        )
    }

    renderInit() {
        const {inputs: {type, init}} = this.props
        if (!['CASCADE_KMEANS', 'KMEANS'].includes(type.value))
            return

        const options = [
            {
                value: 0,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.init.options.random.label')
            },
            {
                value: 1,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.init.options.kmeans.label')
            },
            type.value === 'KMEANS' ? {
                value: 2,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.init.options.canopy.label')
            } : null,
            type.value === 'KMEANS' ? {
                value: 3,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.init.options.farthestFirst.label')
            } : null,
        ].filter(option => option)
        return (
            <Form.Buttons
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.init.label')}
                input={init}
                options={options}
            />
        )
    }

    renderDistanceFunction() {
        const {inputs: {type, distanceFunction}} = this.props
        if (!['CASCADE_KMEANS', 'KMEANS', 'XMEANS'].includes(type.value))
            return

        const options = [
            {
                value: 'Euclidean',
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.distanceFunction.options.euclidean.label')
            },
            {
                value: 'Manhattan',
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.distanceFunction.options.manhattan.label')
            },
            type.value === 'XMEANS' ? {
                value: 'Chebyshev',
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.distanceFunction.options.chebyshev.label')
            } : null
        ].filter(option => option)
        return (
            <Form.Buttons
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.distanceFunction.label')}
                input={distanceFunction}
                options={options}
            />
        )
    }

    renderMaxIterations() {
        const {inputs: {type, maxIterations}} = this.props
        if (!['CASCADE_KMEANS', 'KMEANS', 'XMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxIterations.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxIterations.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxIterations.placeholder')}
                input={maxIterations}
            />
        )
    }

    renderCanopies() {
        const {inputs: {type, canopies}} = this.props
        if (!['KMEANS'].includes(type.value))
            return

        const options = [
            {
                value: false,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.canopies.options.false.label')
            },
            {
                value: true,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.canopies.options.true.label')
            }
        ].filter(option => option)
        return (
            <Form.Buttons
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.canopies.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.canopies.tooltip')}
                input={canopies}
                options={options}
            />
        )
    }

    renderMaxCandidates() {
        const {inputs: {type, maxCandidates}} = this.props
        if (!['KMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxCandidates.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxCandidates.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxCandidates.placeholder')}
                input={maxCandidates}
            />
        )
    }

    renderPeriodicPruning() {
        const {inputs: {type, periodicPruning}} = this.props
        if (!['KMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.periodicPruning.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.periodicPruning.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.periodicPruning.placeholder')}
                input={periodicPruning}
            />
        )
    }

    renderMinDensity() {
        const {inputs: {type, minDensity}} = this.props
        if (!['KMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.minDensity.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.minDensity.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.minDensity.placeholder')}
                input={minDensity}
            />
        )
    }

    renderT1() {
        const {inputs: {type, t1}} = this.props
        if (!['KMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.t1.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.t1.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.t1.placeholder')}
                input={t1}
            />
        )
    }

    renderT2() {
        const {inputs: {type, t2}} = this.props
        if (!['KMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.t2.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.t2.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.t2.placeholder')}
                input={t2}
            />
        )
    }

    renderPreserveOrder() {
        const {inputs: {type, preserveOrder}} = this.props
        if (!['KMEANS'].includes(type.value))
            return

        const options = [
            {
                value: false,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.preserveOrder.options.false.label')
            },
            {
                value: true,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.preserveOrder.options.true.label')
            }
        ].filter(option => option)
        return (
            <Form.Buttons
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.preserveOrder.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.preserveOrder.tooltip')}
                input={preserveOrder}
                options={options}
            />
        )
    }

    renderFast() {
        const {inputs: {type, fast}} = this.props
        if (!['KMEANS'].includes(type.value))
            return

        const options = [
            {
                value: false,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.fast.options.false.label')
            },
            {
                value: true,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.fast.options.true.label')
            }
        ].filter(option => option)
        return (
            <Form.Buttons
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.fast.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.fast.tooltip')}
                input={fast}
                options={options}
            />
        )
    }

    renderSeed() {
        const {inputs: {type, seed}} = this.props
        if (!['KMEANS', 'XMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.seed.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.seed.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.seed.placeholder')}
                input={seed}
            />
        )
    }

    renderLearningRate() {
        const {inputs: {type, learningRate}} = this.props
        if (!['LVQ'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.learningRate.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.learningRate.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.learningRate.placeholder')}
                input={learningRate}
            />
        )
    }

    renderEpochs() {
        const {inputs: {type, epochs}} = this.props
        if (!['LVQ'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.epochs.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.epochs.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.epochs.placeholder')}
                input={epochs}
            />
        )
    }

    renderNormalizeInput() {
        const {inputs: {type, normalizeInput}} = this.props
        if (!['LVQ'].includes(type.value))
            return

        const options = [
            {
                value: false,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.normalizeInput.options.false.label')
            },
            {
                value: true,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.normalizeInput.options.true.label')
            }
        ].filter(option => option)
        return (
            <Form.Buttons
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.normalizeInput.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.normalizeInput.tooltip')}
                input={normalizeInput}
                options={options}
            />
        )
    }

    renderMaxIterationsOverall() {
        const {inputs: {type, maxIterationsOverall}} = this.props
        if (!['XMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxIterationsOverall.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxIterationsOverall.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxIterationsOverall.placeholder')}
                input={maxIterationsOverall}
            />
        )
    }

    renderMaxKMeans() {
        const {inputs: {type, maxKMeans}} = this.props
        if (!['XMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxKMeans.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxKMeans.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxKMeans.placeholder')}
                input={maxKMeans}
            />
        )
    }

    renderMaxForChildren() {
        const {inputs: {type, maxForChildren}} = this.props
        if (!['XMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxForChildren.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxForChildren.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.maxForChildren.placeholder')}
                input={maxForChildren}
            />
        )
    }

    renderUseKD() {
        const {inputs: {type, useKD}} = this.props
        if (!['XMEANS'].includes(type.value))
            return

        const options = [
            {
                value: false,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.useKD.options.false.label')
            },
            {
                value: true,
                label: msg('process.unsupervisedClassification.panel.clusterer.form.config.useKD.options.true.label')
            }
        ].filter(option => option)
        return (
            <Form.Buttons
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.useKD.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.useKD.tooltip')}
                input={useKD}
                options={options}
            />
        )
    }

    renderCutoffFactor() {
        const {inputs: {type, cutoffFactor}} = this.props
        if (!['XMEANS'].includes(type.value))
            return

        return (
            <Form.Input
                label={msg('process.unsupervisedClassification.panel.clusterer.form.config.cutoffFactor.label')}
                tooltip={msg('process.unsupervisedClassification.panel.clusterer.form.config.cutoffFactor.tooltip')}
                placeholder={msg('process.unsupervisedClassification.panel.clusterer.form.config.cutoffFactor.placeholder')}
                input={cutoffFactor}
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
    numberOfClusters: toInt(values.numberOfClusters),
    minNumberOfClusters: toInt(values.minNumberOfClusters),
    maxNumberOfClusters: toInt(values.maxNumberOfClusters),
    restarts: toInt(values.restarts),
    init: toInt(values.init),
    distanceFunction: values.distanceFunction,
    maxIterations: toInt(values.maxIterations),
    canopies: values.canopies,
    maxCandidates: toInt(values.maxCandidates),
    periodicPruning: toInt(values.periodicPruning),
    minDensity: toInt(values.minDensity),
    t1: toFloat(values.t1),
    t2: toFloat(values.t2),
    preserveOrder: values.preserveOrder,
    fast: values.fast,
    seed: toInt(values.seed),
    learningRate: values.learningRate,
    epochs: values.epochs,
    normalizeInput: values.normalizeInput,
    maxIterationsOverall: toInt(values.maxIterationsOverall),
    maxKMeans: toInt(values.maxKMeans),
    maxForChildren: toInt(values.maxForChildren),
    useKD: values.useKD,
    cutoffFactor: toFloat(values.cutoffFactor),
})

const modelToValues = model => ({
    type: model.type,
    numberOfClusters: withDefault(model.numberOfClusters, 7),
    minNumberOfClusters: withDefault(model.minNumberOfClusters, 2),
    maxNumberOfClusters: withDefault(model.maxNumberOfClusters, 10),
    restarts: withDefault(model.restarts, 10),
    init: withDefault(model.init, 0),
    distanceFunction: withDefault(model.distanceFunction, 'Euclidean'),
    maxIterations: withDefault(model.maxIterations, 300),
    canopies: withDefault(model.canopies, false),
    maxCandidates: withDefault(model.maxCandidates, 100),
    periodicPruning: withDefault(model.periodicPruning, 10000),
    minDensity: withDefault(model.minDensity, 2),
    t1: withDefault(model.t1, -1.5),
    t2: withDefault(model.t2, -1),
    preserveOrder: withDefault(model.preserveOrder, false),
    fast: withDefault(model.fast, false),
    seed: withDefault(model.seed, 10),
    learningRate: withDefault(model.learningRate, 1),
    epochs: withDefault(model.epochs, 1000),
    normalizeInput: withDefault(model.normalizeInput, false),
    maxIterationsOverall: withDefault(model.maxIterationsOverall, 3),
    maxKMeans: withDefault(model.maxKMeans, 1000),
    maxForChildren: withDefault(model.maxForChildren, 1000),
    useKD: withDefault(model.useKD, false),
    cutoffFactor: withDefault(model.cutoffFactor, 0),
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

const withDefault = (value, defaultValue) =>
    value === undefined ? defaultValue : value

export const Clusterer = compose(
    _Clusterer,
    recipeFormPanel({id: 'clusterer', fields, valuesToModel, modelToValues, mapRecipeToProps})
)

Clusterer.propTypes = {
    recipeId: PropTypes.string
}
