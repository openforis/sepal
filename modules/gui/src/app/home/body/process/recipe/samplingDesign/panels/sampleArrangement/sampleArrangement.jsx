import PropTypes from 'prop-types'
import React from 'react'

import {isValidSamplingSeed} from '#sepal/recipe/samplingDesign/samplingSeed'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {FormCombo} from '~/widget/form/combo'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import {samplingGridCrsOptions} from '../../samplingGridCrsOptions'
import {DEFAULT_CRS, includeCrs, includeMinDistance, includeSeed, isSkipped} from './arrangementApplicability'
import {formatDistance, minDistanceFloorViolation, minDistanceGridFloor, minDistancePixelSize} from './minDistanceValidation'
import styles from './sampleArrangement.module.css'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    unstratified: isSkipped(selectFrom(recipe, 'model.stratification.skip')),
    stratificationGrid: {
        scale: selectFrom(recipe, 'model.stratification.scale')
    }
})

const fields = {
    requiresUpdate: new Form.Field(),
    arrangementStrategy: new Form.Field(),
    sampleSizeStrategy: new Form.Field()
        .skip((_seed, {arrangementStrategy}) => arrangementStrategy !== 'SYSTEMATIC'),
    gridOrigin: new Form.Field()
        .skip((_value, {arrangementStrategy}) => arrangementStrategy !== 'SYSTEMATIC'),
    minDistance: new Form.Field()
        .skip((_minDistance, values) => !includeMinDistance(values))
        .number()
        .min(0),
    // Kept in the model even for unstratified Random (which hides it) so switching to a grid mode keeps a value.
    crs: new Form.Field()
        .notBlank(),
    seed: new Form.Field()
        .skip((_seed, values) => !includeSeed(values))
        .predicate(isValidSamplingSeed, 'process.samplingDesign.panel.sampleArrangement.form.seed.invalid'),
}

class _SampleArrangement extends React.Component {
    state = {more: false}

    render() {
        const {more} = this.state
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='border-none'
                    title={msg('process.samplingDesign.panel.sampleArrangement.title')}/>

                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons>
                    {this.crsApplies() ? (
                        <Button
                            label={more ? msg('button.less') : msg('button.more')}
                            onClick={() => this.setState(({more}) => ({more: !more}))}
                        />
                    ) : null}
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    crsApplies() {
        const {unstratified, inputs: {arrangementStrategy}} = this.props
        return includeCrs({unstratified, arrangementStrategy: arrangementStrategy.value})
    }

    renderContent() {
        const {inputs: {arrangementStrategy, sampleSizeStrategy, gridOrigin}} = this.props
        const systematic = arrangementStrategy.value === 'SYSTEMATIC'
        const showSeed = includeSeed({arrangementStrategy: arrangementStrategy.value, sampleSizeStrategy: sampleSizeStrategy.value, gridOrigin: gridOrigin.value})
        const showMinDistance = includeMinDistance({arrangementStrategy: arrangementStrategy.value})
        return (
            <Layout>
                <Layout type='horizontal'>
                    {this.renderArrangementStrategy()}
                </Layout>
                {systematic ? this.renderSampleSizeStrategy() : null}
                {systematic ? this.renderGridOrigin() : null}
                <Layout type='horizontal'>
                    {showMinDistance ? this.renderMinDistance() : null}
                    {showSeed ? this.renderSeed() : null}
                </Layout>
                {this.state.more && this.crsApplies() ? this.renderCrs() : null}
            </Layout>
        )
    }

    renderArrangementStrategy() {
        const {inputs: {arrangementStrategy}} = this.props
        return (
            <Form.Buttons
                label={msg('process.samplingDesign.panel.sampleArrangement.form.arrangementStrategy.label')}
                input={arrangementStrategy}
                options={[
                    {
                        value: 'RANDOM',
                        label: msg('process.samplingDesign.panel.sampleArrangement.form.arrangementStrategy.RANDOM.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleArrangement.form.arrangementStrategy.RANDOM.tooltip')
                    },
                    {
                        value: 'SYSTEMATIC',
                        label: msg('process.samplingDesign.panel.sampleArrangement.form.arrangementStrategy.SYSTEMATIC.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleArrangement.form.arrangementStrategy.SYSTEMATIC.tooltip')
                    },
                ]}
            />
        )
    }

    // Blank means different things per mode: a stratified grid has a hard floor to fall back to, while
    // unstratified is analytical and simply applies no extra constraint.
    renderMinDistance() {
        const {inputs: {minDistance}} = this.props
        const minimum = this.gridFloor()
        const key = 'process.samplingDesign.panel.sampleArrangement.form.minDistance'
        return (
            <Form.Input
                label={msg(`${key}.label`)}
                tooltip={minimum === null
                    ? msg(`${key}.tooltip.optional`)
                    : msg(`${key}.tooltip.gridFloor`, {
                        minimum: formatDistance(minimum),
                        pixelSize: formatDistance(minDistancePixelSize(this.minDistanceContext()))
                    })}
                placeholder={minimum === null ? msg(`${key}.placeholder`) : String(formatDistance(minimum))}
                input={minDistance}
                type='number'
                suffix={msg('process.samplingDesign.panel.stratification.form.scale.suffix')}
            />
        )
    }

    renderSampleSizeStrategy() {
        const {inputs: {sampleSizeStrategy}} = this.props
        return (
            <Form.Buttons
                label={msg('process.samplingDesign.panel.sampleArrangement.form.sampleSizeStrategy.label')}
                input={sampleSizeStrategy}
                options={[
                    {
                        value: 'OVER',
                        label: msg('process.samplingDesign.panel.sampleArrangement.form.sampleSizeStrategy.OVER.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleArrangement.form.sampleSizeStrategy.OVER.tooltip')
                    },
                    {
                        value: 'CLOSEST',
                        label: msg('process.samplingDesign.panel.sampleArrangement.form.sampleSizeStrategy.CLOSEST.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleArrangement.form.sampleSizeStrategy.CLOSEST.tooltip')
                    },
                    {
                        value: 'EXACT',
                        label: msg('process.samplingDesign.panel.sampleArrangement.form.sampleSizeStrategy.EXACT.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleArrangement.form.sampleSizeStrategy.EXACT.tooltip')
                    },
                ]}
            />
        )
    }

    renderGridOrigin() {
        const {inputs: {gridOrigin}} = this.props
        return (
            <Form.Buttons
                label={msg('process.samplingDesign.panel.sampleArrangement.form.gridOrigin.label')}
                tooltip={msg('process.samplingDesign.panel.sampleArrangement.form.gridOrigin.tooltip')}
                input={gridOrigin}
                options={[
                    {
                        value: 'FIXED',
                        label: msg('process.samplingDesign.panel.sampleArrangement.form.gridOrigin.FIXED.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleArrangement.form.gridOrigin.FIXED.tooltip')
                    },
                    {
                        value: 'SEEDED',
                        label: msg('process.samplingDesign.panel.sampleArrangement.form.gridOrigin.SEEDED.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleArrangement.form.gridOrigin.SEEDED.tooltip')
                    },
                ]}
            />
        )
    }

    renderCrs() {
        const {inputs: {crs}} = this.props
        return (
            <FormCombo
                label={msg('process.retrieve.form.crs.label')}
                tooltip={msg('process.samplingDesign.panel.sampleArrangement.form.crs.tooltip')}
                input={crs}
                options={samplingGridCrsOptions()}
            />
        )
    }

    renderSeed() {
        const {inputs: {seed}} = this.props
        return (
            <Form.Input
                className={styles.number}
                label={msg('process.samplingDesign.panel.sampleArrangement.form.seed.label')}
                tooltip={msg('process.samplingDesign.panel.sampleArrangement.form.seed.tooltip')}
                placeholder={msg('process.samplingDesign.panel.sampleArrangement.form.seed.placeholder')}
                input={seed}
                type='number'
            />
        )
    }

    componentDidMount() {
        const {inputs: {requiresUpdate, arrangementStrategy, sampleSizeStrategy, gridOrigin, crs, seed}} = this.props
        requiresUpdate.set(false)
        arrangementStrategy.value || arrangementStrategy.set('RANDOM')
        sampleSizeStrategy.value || sampleSizeStrategy.set('OVER')
        gridOrigin.value || gridOrigin.set('FIXED')
        crs.value || crs.set(DEFAULT_CRS)
        // Default only an absent/blank seed; a saved invalid value is preserved so it is visibly rejected.
        if (seed.value == null || seed.value === '') {
            seed.set(1)
        }
        // Reveal advanced options automatically when a non-default CRS was saved, so the setting is discoverable.
        if (crs.value && crs.value !== DEFAULT_CRS) {
            this.setState({more: true})
        }
        this.validateMinDistance()
    }

    // Derived validation, not derived state: setInvalid writes only the error, so revalidating on an external
    // grid change (or a mode switch) never marks the panel dirty or disturbs unrelated unsaved edits.
    componentDidUpdate() {
        this.validateMinDistance()
    }

    validateMinDistance() {
        const {inputs: {minDistance}} = this.props
        const violation = minDistanceFloorViolation(this.minDistanceContext())
        const floorError = violation
            ? msg('process.samplingDesign.panel.sampleArrangement.form.minDistance.belowGridFloor', violation)
            : ''
        // Fall back to the field's own validators when the floor rule is satisfied or does not apply, so
        // clearing the derived error can never hide a .number()/.min() error and leave Apply blocked silently.
        const error = floorError || minDistance.isInvalid() || ''
        if ((minDistance.error || '') !== error) {
            minDistance.setInvalid(error)
        }
    }

    minDistanceContext() {
        const {unstratified, stratificationGrid, inputs: {minDistance, arrangementStrategy}} = this.props
        return {
            minDistance: minDistance.value,
            unstratified,
            arrangementStrategy: arrangementStrategy.value,
            stratificationGrid
        }
    }

    gridFloor() {
        return minDistanceGridFloor(this.minDistanceContext())
    }

}

const valuesToModel = values => ({
    requiresUpdate: values.requiresUpdate,
    arrangementStrategy: values.arrangementStrategy,
    sampleSizeStrategy: values.sampleSizeStrategy,
    gridOrigin: values.gridOrigin,
    minDistance: values.minDistance === '' || values.minDistance == null ? null : parseFloat(values.minDistance),
    crs: values.crs,
    seed: parseInt(values.seed),
})

// Default CRS before form comparison so an absent value does not open the panel dirty.
const modelToValues = model => ({...model, crs: model.crs || DEFAULT_CRS})

export const SampleArrangement = compose(
    _SampleArrangement,
    recipeFormPanel({id: 'sampleArrangement', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

SampleArrangement.propTypes = {
    recipeId: PropTypes.string
}
