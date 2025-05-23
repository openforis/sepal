import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import {allocate} from './allocate'
import {AllocationTable} from './allocationTable'
// import {calculateStratumErrors} from './confidenceInterval'
import {calculateMarginOfError} from './marginOfError'
import styles from './sampleAllocation.module.css'
import {calculateSampleSize} from './sampleSize'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    unstratified: selectFrom(recipe, 'model.stratification.skip'),
    strata: selectFrom(recipe, 'model.stratification.strata'),
    noProportions: selectFrom(recipe, 'model.proportions.skip'),
    anticipatedProportions: selectFrom(recipe, 'model.proportions.anticipatedProportions')
})

const fields = {
    requiresUpdate: new Form.Field(),
    manual: new Form.Field(),
    estimateSampleSize: new Form.Field(),
    confidenceLevel: new Form.Field()
        .notBlank()
        .number(),
    sampleSize: new Form.Field()
        .skip((_sampleSize, {manual, estimateSampleSize}) => manual.length || estimateSampleSize)
        .notBlank()
        .int(),
    marginOfError: new Form.Field()
        .skip((_marginOfError, {manual, estimateSampleSize}) => manual.length || !estimateSampleSize)
        .notBlank()
        .number(),
    relativeMarginOfError: new Form.Field(),
    allocationStrategy: new Form.Field(),
    minSamplesPerStratum: new Form.Field()
        .notBlank(),
    powerTuningConstant: new Form.Field()
        .skip((_powerTuningConstant, {manual, allocationStrategy}) => manual.length || allocationStrategy !== 'POWER')
        .notBlank()
        .number(),
    allocation: new Form.Field()
        .notBlank()
}

const enoughSamplesToCoverMin = ({sampleSize, minSamplesPerStratum, allocation}) =>
    !sampleSize || !minSamplesPerStratum || !allocation || minSamplesPerStratum * allocation.length <= sampleSize

const noNaNs = ({allocation, sampleSize, minSamplesPerStratum}) =>
    !sampleSize
        || !enoughSamplesToCoverMin({allocation, sampleSize, minSamplesPerStratum})
        || !allocation || !allocation.find(({sampleSize}) => isNaN(sampleSize))

const constraints = {
    noNaN: new Form.Constraint(['marginOfError', 'relativeMarginOfError', 'allocationStrategy', 'allocation'])
        .predicate(noNaNs,
            'process.samplingDesign.panel.sampleAllocation.form.allocation.tooBig'
        ),
    enoughSamples: new Form.Constraint(['sampleSize', 'minSamplesPerStratum'])
        .predicate(enoughSamplesToCoverMin,
            'process.samplingDesign.panel.sampleAllocation.form.sampleSize.notEnough'
        ),
}

class _SampleAllocation extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='chart-column'
                    label={this.renderHeaderButtons()}
                    title={msg('process.samplingDesign.panel.sampleAllocation.title')}/>
            
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderHeaderButtons() {
        const {noProportions, inputs: {manual}} = this.props
        return (
            <Form.Buttons
                input={manual}
                disabled={noProportions}
                options={[
                    {
                        value: true,
                        icon: 'rectangle-list',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.manual.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.manual.tooltip')
                    },
                ]}
                multiple
            />
        )
    }

    renderContent() {
        const {noProportions, inputs: {manual, estimateSampleSize, allocationStrategy}} = this.props
        const usingPowerAllocation = allocationStrategy.value === 'POWER'
        const isManual = manual.value?.length
        return (
            <Layout>
                {isManual ? null : (
                    <Layout type='horizontal'>
                        {this.renderEstimateSampleSize()}
                        {estimateSampleSize.value
                            ? this.renderMarginOfError()
                            : this.renderSampleSize()}
                    </Layout>
                )}
                
                <Layout type='horizontal'>
                    {noProportions ? null : this.renderRelativeMarginOfError()}
                    {noProportions ? null : this.renderConfidenceLevel()}
                </Layout>
                {isManual ? null : this.renderAllocationStrategy()}
                {isManual ? null : (
                    <Layout type='horizontal' alignment='distribute'>
                        {this.renderMinSamplesPerStratum()}
                        {usingPowerAllocation ? this.renderPowerTuningConstant() : <div/>}
                    </Layout>
                )}
                {this.renderAllocation()}
            </Layout>
        )

    }

    renderEstimateSampleSize() {
        const {inputs: {estimateSampleSize}} = this.props
        return (
            <Form.Buttons
                className={styles.estimateSampleSize}
                label={msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.label')}
                input={estimateSampleSize}
                options={[
                    {
                        value: false,
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.false.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.false.tooltip'),
                    },
                    {
                        value: true,
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.true.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.true.tooltip')
                    }
                ]}
            />
        )
    }

    renderConfidenceLevel() {
        const {inputs: {confidenceLevel}} = this.props
        return (
            <Form.Input
                className={styles.confidenceLevel}
                label={msg('process.samplingDesign.panel.sampleAllocation.form.confidenceLevel.label')}
                placeholder={msg('process.samplingDesign.panel.sampleAllocation.form.confidenceLevel.placeholder')}
                tooltip={msg('process.samplingDesign.panel.sampleAllocation.form.confidenceLevel.tooltip')}
                input={confidenceLevel}
                type='number'
                errorMessage={[confidenceLevel, 'noNaN']}
                suffix={msg('process.samplingDesign.panel.sampleAllocation.form.confidenceLevel.suffix')}
            />
        )
    }

    renderSampleSize() {
        const {inputs: {sampleSize}} = this.props
        return (
            <Form.Input
                className={styles.sampleSize}
                label={msg('process.samplingDesign.panel.sampleAllocation.form.sampleSize.label')}
                placeholder={msg('process.samplingDesign.panel.sampleAllocation.form.sampleSize.placeholder')}
                tooltip={msg('process.samplingDesign.panel.sampleAllocation.form.sampleSize.tooltip')}
                input={sampleSize}
                errorMessage={[sampleSize, 'enoughSamples']}
                type='number'
            />
        )
    }

    renderMarginOfError() {
        const {inputs: {marginOfError, relativeMarginOfError}} = this.props
        return (
            <Form.Input
                className={styles.marginOfError}
                label={msg('process.samplingDesign.panel.sampleAllocation.form.marginOfError.label')}
                placeholder={msg('process.samplingDesign.panel.sampleAllocation.form.marginOfError.placeholder')}
                tooltip={msg('process.samplingDesign.panel.sampleAllocation.form.marginOfError.tooltip')}
                input={marginOfError}
                errorMessage={[marginOfError, 'noNaN']}
                validate='onChange'
                type='number'
                suffix={relativeMarginOfError.value ? '%' : 'ha'}
            />
        )
    }

    renderMinSamplesPerStratum() {
        const {inputs: {minSamplesPerStratum, allocationStrategy}} = this.props
        const disabled = allocationStrategy.value === 'EQUAL'
        return (
            <Form.Input
                className={styles.minSamplesPerStratum}
                label={msg('process.samplingDesign.panel.sampleAllocation.form.minSamplesPerStratum.label')}
                placeholder={msg('process.samplingDesign.panel.sampleAllocation.form.minSamplesPerStratum.placeholder')}
                tooltip={msg('process.samplingDesign.panel.sampleAllocation.form.minSamplesPerStratum.tooltip')}
                input={minSamplesPerStratum}
                errorMessage={disabled ? undefined : [minSamplesPerStratum, 'enoughSamples']}
                type='number'
                disabled={disabled}
            />
        )
    }

    renderRelativeMarginOfError() {
        const {inputs: {relativeMarginOfError}} = this.props
        return (
            <Form.Buttons
                className={styles.relativeMarginOfError}
                label={msg('process.samplingDesign.panel.sampleAllocation.form.relativeMarginOfError.label')}
                input={relativeMarginOfError}
                options={[
                    {
                        value: true,
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.relativeMarginOfError.true.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.relativeMarginOfError.true.tooltip')
                    },
                    {
                        value: false,
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.relativeMarginOfError.false.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.relativeMarginOfError.false.tooltip')
                    },
                ]}
            />
        )
    }

    renderAllocationStrategy() {
        const {noProportions, inputs: {allocationStrategy}} = this.props
        return (
            <Form.Buttons
                label={msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.label')}
                input={allocationStrategy}
                options={[
                    {
                        value: 'PROPORTIONAL',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.PROPORTIONAL.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.PROPORTIONAL.tooltip'),
                    },
                    {
                        value: 'EQUAL',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.EQUAL.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.EQUAL.tooltip'),
                    },
                    {
                        value: 'BALANCED',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.BALANCED.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.BALANCED.tooltip'),
                    },
                    {
                        value: 'OPTIMAL',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.OPTIMAL.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.OPTIMAL.tooltip'),
                        disabled: noProportions
                    },
                    {
                        value: 'POWER',
                        label: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.POWER.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleAllocation.form.allocationStrategy.POWER.tooltip'),
                        disabled: noProportions
                    },
                ]}
            />
        )
    }

    renderPowerTuningConstant() {
        const {inputs: {powerTuningConstant}} = this.props
        return (
            <Form.Input
                className={styles.powerTuningConstant}
                label={msg('process.samplingDesign.panel.sampleAllocation.form.powerTuningConstant.label')}
                placeholder={msg('process.samplingDesign.panel.sampleAllocation.form.powerTuningConstant.placeholder')}
                tooltip={msg('process.samplingDesign.panel.sampleAllocation.form.powerTuningConstant.tooltip')}
                input={powerTuningConstant}
                type='number'
            />
        )
    }

    renderAllocation() {
        const {inputs: {allocation, marginOfError, relativeMarginOfError, confidenceLevel}} = this.props
        const sampleSize = allocation.value
            ? _.sum(allocation.value.map(({sampleSize}) => sampleSize))
            : 0
        // const stratumErrors = allocation.value
        //     ? calculateStratumErrors({
        //         confidenceLevel: parseFloat(confidenceLevel.value) / 100,
        //         allocation: allocation.value,
        //         relative: relativeMarginOfError.value
        //     })
        //     : null
        // console.log(stratumErrors)
        return (
            <Widget
                label={msg('process.samplingDesign.panel.sampleAllocation.form.allocation.label')}>
                {allocation.value
                    ? <AllocationTable
                        allocation={allocation.value}
                        sampleSize={sampleSize}
                        marginOfError={marginOfError.value}
                        relativeMarginOfError={relativeMarginOfError.value}
                    />
                    : <NoData
                        alignment='left'
                        message={msg('Select ... something')}
                    />}
                
            </Widget>
        )
    }

    componentDidMount() {
        const {strata, anticipatedProportions, inputs: {requiresUpdate, manual, estimateSampleSize, confidenceLevel, marginOfError, relativeMarginOfError, minSamplesPerStratum, allocationStrategy, powerTuningConstant, allocation}} = this.props
        requiresUpdate.set(false)
        manual.value || manual.set([])
        estimateSampleSize.value || estimateSampleSize.set(false)
        confidenceLevel.value || confidenceLevel.set(95)
        marginOfError.value || marginOfError.set(50)
        relativeMarginOfError.value || relativeMarginOfError.set(true)
        anticipatedProportions
            ? allocationStrategy.value || allocationStrategy.set('OPTIMAL')
            : ['EQUAL', 'PROPORTIONAL', 'BALANCED'].includes(allocationStrategy.value) || allocationStrategy.set('BALANCED')
        minSamplesPerStratum.value || minSamplesPerStratum.set('1')
        allocationStrategy.value || allocationStrategy.set('EQUAL')
        powerTuningConstant.value || powerTuningConstant.set('0.5')

        // TODO: If allocation stratum doesn't match strata, reset allocation based off stratum or anticipatedProportions

        const expectedStrata = strata.map(({value}) => value)
        const actualStrata = allocation.value?.map(({stratum}) => stratum)
        if (!_.isEqual(expectedStrata, actualStrata)) {
            allocation.set(anticipatedProportions || strata.map(stratum => ({...stratum, stratum: stratum.value})))
        }
        setImmediate(() => this.allocate())
    }
    
    componentDidUpdate(prevProps) {
        if (!_.isEqual(allocateDeps(prevProps), allocateDeps(this.props))) {
            this.allocate()
        }
    }
        
    allocate() {
        const {strata, anticipatedProportions, inputs: {manual, estimateSampleSize, sampleSize, marginOfError, relativeMarginOfError, confidenceLevel, allocationStrategy, minSamplesPerStratum, powerTuningConstant, allocation}} = this.props
        if (manual.value?.length) {
            return
        }
        // TODO: Make marginOfError for each stratum part of allocation
        const updateAllocation = sampleSize => {
            const calculatedAllocation = allocate({
                sampleSize: parseInt(sampleSize),
                strategy: allocationStrategy.value,
                minSamplesPerStratum: parseInt(minSamplesPerStratum.value),
                strata: anticipatedProportions || strata.map(stratum => ({...stratum, stratum: stratum.value})),
                tuningConstant: parseFloat(powerTuningConstant.value)
            })
            allocation.set(calculatedAllocation)
        }
        if (estimateSampleSize.value && anticipatedProportions) {
            const calculatedSampleSize = calculateSampleSize({
                marginOfError: relativeMarginOfError.value ? parseFloat(marginOfError.value) / 100 : parseFloat(marginOfError.value),
                relativeMarginOfError: relativeMarginOfError.value,
                strategy: allocationStrategy.value,
                minSamplesPerStratum: minSamplesPerStratum.value ? parseInt(minSamplesPerStratum.value) : 0,
                strata: anticipatedProportions,
                tuningConstant: parseFloat(powerTuningConstant.value),
                confidenceLevel: parseFloat(confidenceLevel.value) / 100
            })
            sampleSize.set(calculatedSampleSize)
            updateAllocation(calculatedSampleSize)
        } else {
            if (sampleSize.value < minSamplesPerStratum.value * allocation.value.length) {
                const undefinedAllocation = allocation.value.map(stratum => ({
                    ...stratum,
                    sampleSize: NaN
                }))
                allocation.set(undefinedAllocation)
                marginOfError.set(null)
            } else if (anticipatedProportions) {
                const calculatedMarginOfError = calculateMarginOfError({
                    sampleSize: parseInt(sampleSize.value),
                    relativeMarginOfError: relativeMarginOfError.value,
                    confidenceLevel: parseFloat(confidenceLevel.value) / 100,
                    strategy: allocationStrategy.value,
                    minSamplesPerStratum: minSamplesPerStratum.value ? parseInt(minSamplesPerStratum.value) : 0,
                    strata: anticipatedProportions,
                    tuningConstant: parseFloat(powerTuningConstant.value)
                })
                marginOfError.set(relativeMarginOfError.value ? Math.round(calculatedMarginOfError * 100) : calculatedMarginOfError)
                updateAllocation(sampleSize.value)
            } else {
                updateAllocation(sampleSize.value)
            }
        }
    }
}

const allocateDeps = props => {
    const {inputs: {estimateSampleSize, sampleSize, marginOfError, relativeMarginOfError, confidenceLevel, allocationStrategy, minSamplesPerStratum, powerTuningConstant}} = props
    return [estimateSampleSize?.value ? marginOfError : sampleSize, relativeMarginOfError, confidenceLevel, allocationStrategy, minSamplesPerStratum, powerTuningConstant]
        .map(input => input?.value)
}

const valuesToModel = values => {
    return values
}

const modelToValues = model => {
    return model
}

export const SampleAllocation = compose(
    _SampleAllocation,
    recipeFormPanel({id: 'sampleAllocation', fields, constraints, mapRecipeToProps, modelToValues, valuesToModel})
)

SampleAllocation.propTypes = {
    recipeId: PropTypes.string
}
