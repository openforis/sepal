import PropTypes from 'prop-types'
import React from 'react'

import {DEFAULT_SAMPLING_GRID_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'
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
import {formatDistance, minDistanceFloorViolation, minDistanceGridFloor, minDistancePixelSize} from './minDistanceValidation'
import styles from './sampleArrangement.module.css'
import {crsTransformField} from './sampleArrangementForm'
import {includeMinDistance, includeSeed, isSkipped, shouldShowMore} from './showMore'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    scale: selectFrom(recipe, 'model.stratification.scale') || 10,
    unstratified: isSkipped(selectFrom(recipe, 'model.stratification.skip')),
    stratificationGrid: {
        scale: selectFrom(recipe, 'model.stratification.scale'),
        crsTransform: selectFrom(recipe, 'model.stratification.crsTransform')
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
    // The sampling grid, used ONLY for unstratified designs: there is no stratification to take it from, so
    // this panel owns it. Stratified designs read the grid from Stratification instead and ignore these.
    scale: new Form.Field()
        .number()
        .greaterThan(0),
    crs: new Form.Field()
        .notBlank(),
    crsTransform: crsTransformField,
    seed: new Form.Field()
        .skip((_seed, values) => !includeSeed(values))
        .notBlank()
        .int(),
}

class _SampleArrangement extends React.Component {
    state = {more: false}

    render() {
        const {unstratified} = this.props
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
                    {unstratified ? (
                        <Button
                            label={more ? msg('button.less') : msg('button.more')}
                            onClick={() => this.setState({more: !more})}
                        />
                    ) : null}
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {unstratified, inputs: {arrangementStrategy, sampleSizeStrategy, gridOrigin}} = this.props
        const {more} = this.state
        const showSeed = includeSeed({arrangementStrategy: arrangementStrategy.value, sampleSizeStrategy: sampleSizeStrategy.value, gridOrigin: gridOrigin.value})
        const showMinDistance = includeMinDistance({arrangementStrategy: arrangementStrategy.value})
        return (
            <Layout>
                <Layout type='horizontal'>
                    {this.renderArrangementStrategy()}
                </Layout>
                {arrangementStrategy.value === 'SYSTEMATIC' ? this.renderSampleSizeStrategy() : null}
                {arrangementStrategy.value === 'SYSTEMATIC' ? this.renderGridOrigin() : null}
                <Layout type='horizontal'>
                    {showMinDistance ? this.renderMinDistance() : null}
                    {showSeed ? this.renderSeed() : null}
                </Layout>
                {more && unstratified ? (
                    <Layout type='horizontal' alignment='left'>
                        {this.renderCrs()}
                        {this.renderCrsTransform()}
                    </Layout>
                ) : null}
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

    renderScale() {
        const {inputs: {scale}} = this.props
        return (
            <Form.Input
                className={styles.number}
                label={msg('process.samplingDesign.panel.stratification.form.scale.label')}
                placeholder={msg('process.samplingDesign.panel.stratification.form.scale.placeholder')}
                tooltip={msg('process.samplingDesign.panel.stratification.form.scale.tooltip')}
                input={scale}
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

    renderCrsTransform() {
        const {inputs: {crsTransform}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.crsTransform.label')}
                placeholder={msg('process.retrieve.form.crsTransform.placeholder')}
                tooltip={msg('process.samplingDesign.panel.sampleArrangement.form.crsTransform.tooltip')}
                input={crsTransform}
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
        const {inputs: {requiresUpdate, arrangementStrategy, sampleSizeStrategy, gridOrigin, scale, seed, crs, crsTransform}} = this.props
        // Saved non-default advanced grid settings should be visible on open.
        this.setState({
            more: shouldShowMore({
                crs: crs.value,
                crsTransform: crsTransform.value,
                seed: seed.value
            })
        })
        requiresUpdate.set(false)
        arrangementStrategy.value || arrangementStrategy.set('RANDOM')
        sampleSizeStrategy.value || sampleSizeStrategy.set('OVER')
        gridOrigin.value || gridOrigin.set('FIXED')
        scale.value || scale.set(this.props.scale)
        // Use an equal-area sampling CRS by default; Retrieve output CRS is separate.
        crs.value || crs.set(DEFAULT_SAMPLING_GRID_CRS)
        seed.value || seed.set(1)
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

const valuesToModel = values => {
    return {
        requiresUpdate: values.requiresUpdate,
        arrangementStrategy: values.arrangementStrategy,
        sampleSizeStrategy: values.sampleSizeStrategy,
        gridOrigin: values.gridOrigin,
        minDistance: values.minDistance === '' || values.minDistance == null ? null : parseFloat(values.minDistance),
        scale: parseFloat(values.scale),
        crs: values.crs,
        crsTransform: values.crsTransform,
        seed: parseInt(values.seed),
    }
}

const modelToValues = model => {
    return model
}

export const SampleArrangement = compose(
    _SampleArrangement,
    recipeFormPanel({id: 'sampleArrangement', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

SampleArrangement.propTypes = {
    recipeId: PropTypes.string
}
