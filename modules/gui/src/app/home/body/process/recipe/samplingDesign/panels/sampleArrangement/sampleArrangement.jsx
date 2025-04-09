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

import styles from './sampleArrangement.module.css'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || [],
    scale: selectFrom(recipe, 'model.stratification.scale') || 10,
})

const fields = {
    requiresUpdate: new Form.Field(),
    arrangementStrategy: new Form.Field(),
    sampleSizeStrategy: new Form.Field()
        .skip((_seed, {arrangementStrategy}) => arrangementStrategy !== 'SYSTEMATIC'),
    minDistance: new Form.Field()
        .number()
        .min(0),
    scale: new Form.Field()
        .number()
        .greaterThan(0),
    crs: new Form.Field()
        .notBlank(),
    crsTransform: new Form.Field(),
    seed: new Form.Field()
        .skip((_seed, {arrangementStrategy, sampleSizeStrategy}) => includeSeed(arrangementStrategy, sampleSizeStrategy))
        .notBlank()
        .int(),
}

class _SampleArrangement extends React.Component {
    state = {more: false}

    constructor(props) {
        super(props)
    }

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
                    <Button
                        label={more ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setState({more: !more})}
                    />
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {arrangementStrategy}} = this.props
        const {more} = this.state
        return (
            <Layout>
                <Layout type='horizontal'>
                    {this.renderArrangementStrategy()}
                </Layout>
                {arrangementStrategy.value === 'SYSTEMATIC' ? this.renderSampleSizeStrategy() : null}
                <Layout type='horizontal'>
                    {this.renderMinDistance()}
                    {more ? this.renderScale() : null}
                    {more ? this.renderSeed() : null}
                </Layout>
                <Layout type='horizontal'>
                    {more ? this.renderCrs() : null}
                    {more ? this.renderCrsTransform() : null}
                </Layout>
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

    renderMinDistance() {
        const {inputs: {minDistance}} = this.props
        return (
            <Form.Input
                className={styles.number}
                label={msg('process.samplingDesign.panel.sampleArrangement.form.minDistance.label')}
                tooltip={msg('process.samplingDesign.panel.sampleArrangement.form.minDistance.tooltip')}
                placeholder={msg('process.samplingDesign.panel.sampleArrangement.form.minDistance.placeholder')}
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
                onChange={this.onScaleChanged}
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

    renderCrs() {
        const {inputs: {crs}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.crs.label')}
                placeholder={msg('process.retrieve.form.crs.placeholder')}
                tooltip={msg('process.retrieve.form.crs.tooltip')}
                input={crs}
            />
        )
    }

    renderCrsTransform() {
        const {inputs: {crsTransform}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.crsTransform.label')}
                placeholder={msg('process.retrieve.form.crsTransform.placeholder')}
                tooltip={msg('process.retrieve.form.crsTransform.tooltip')}
                input={crsTransform}
            />
        )
    }

    renderSeed() {
        const {inputs: {seed, arrangementStrategy, sampleSizeStrategy}} = this.props
        return (
            <Form.Input
                className={styles.number}
                label={msg('process.samplingDesign.panel.sampleArrangement.form.seed.label')}
                tooltip={msg('process.samplingDesign.panel.sampleArrangement.form.seed.tooltip')}
                placeholder={msg('process.samplingDesign.panel.sampleArrangement.form.seed.placeholder')}
                input={seed}
                disabled={!includeSeed({arrangementStrategy: arrangementStrategy.value, sampleSizeStrategy: sampleSizeStrategy.value})}
                type='number'
            />
        )
    }

    componentDidMount() {
        const {inputs: {requiresUpdate, arrangementStrategy, sampleSizeStrategy, minDistance, scale, seed, crs, crsTransform}} = this.props
        const more = (crs.value && crs.value !== 'EPSG:4326')
            || (crsTransform.value)
            || (parseInt(seed.value) !== 1)
        this.setState({more})
        requiresUpdate.set(false)
        arrangementStrategy.value || arrangementStrategy.set('RANDOM')
        sampleSizeStrategy.value || sampleSizeStrategy.set('OVER')
        minDistance.value || minDistance.set(this.props.scale * 2)
        scale.value || scale.set(this.props.scale)
        crs.value || crs.set('EPSG:4326')
    }
}

const includeSeed = ({arrangementStrategy, sampleSizeStrategy}) =>
    arrangementStrategy === 'RANDOM' || sampleSizeStrategy === 'EXACT'

const valuesToModel = values => {
    return {
        requiresUpdate: values.requiresUpdate,
        arrangementStrategy: values.arrangementStrategy,
        sampleSizeStrategy: values.sampleSizeStrategy,
        minDistance: parseFloat(values.minDistance),
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
