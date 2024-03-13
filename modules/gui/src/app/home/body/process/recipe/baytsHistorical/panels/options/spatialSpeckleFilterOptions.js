import {Form} from 'widget/form'
import {Layout} from 'widget/layout'
import {SubformDetails} from './subformDetails'
import {compose} from 'compose'
import {modalSubformPanel} from './modalSubformPanel'
import {msg} from 'translate'
import {withActivators} from 'widget/activation/activator'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './options.module.css'

const KERNEL_SIZES = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25]

const _SpatialSpeckleFilterOptions = ({
    spatialSpeckleFilter,
    inputs,
    activator: {activatables: {spatialSpeckleFilterOptions}}
}) => {
    const fields = filterFields({spatialSpeckleFilter, inputs}).map(name => ({
        label: msg(['process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions', name, 'label']),
        value: inputs[name].value
    }))
    return (
        <React.Fragment>
            <SubformDetails
                fields={fields}
                onClick={() => spatialSpeckleFilterOptions.activate()}/>
            <SpatialSpeckleFilterOptionsPanel spatialSpeckleFilter={spatialSpeckleFilter} inputsToUpdate={inputs}/>
        </React.Fragment>
    )
}

export const SpatialSpeckleFilterOptions = compose(
    _SpatialSpeckleFilterOptions,
    withActivators('spatialSpeckleFilterOptions')
)

const filterFields = ({spatialSpeckleFilter, inputs}) => [
    (['BOXCAR', 'GAMMA_MAP', 'LEE_SIGMA', 'LEE'].includes(spatialSpeckleFilter) ? ['kernelSize'] : []),
    (spatialSpeckleFilter === 'LEE_SIGMA' ? ['sigma'] : []),
    (spatialSpeckleFilter === 'SNIC' ? ['snicSize', 'snicCompactness'] : []),
    (spatialSpeckleFilter !== 'NONE' ? ['strongScatterers'] : []),
    (spatialSpeckleFilter !== 'NONE' && inputs.strongScatterers?.value === 'RETAIN' ? ['strongScattererValue1', 'strongScattererValue2'] : []),
].flat()

SpatialSpeckleFilterOptions.propTypes = {
    inputs: PropTypes.shape({
        kernelSize: PropTypes.object.isRequired,
        sigma: PropTypes.object.isRequired,
        snicCompactness: PropTypes.object.isRequired,
        snicSize: PropTypes.object.isRequired,
        strongScatterers: PropTypes.object.isRequired,
        strongScattererValue1: PropTypes.object.isRequired,
        strongScattererValue2: PropTypes.object.isRequired,
    }).isRequired,
    spatialSpeckleFilter: PropTypes.any.isRequired,
}

const fields = {
    kernelSize: new Form.Field()
        .notBlank()
        .number(),
    sigma: new Form.Field()
        .notBlank()
        .number(),
    strongScatterers: new Form.Field()
        .notBlank(),
    strongScattererValue1: new Form.Field()
        .notBlank()
        .number(),
    strongScattererValue2: new Form.Field()
        .notBlank()
        .number(),
    snicSize: new Form.Field()
        .notBlank()
        .number(),
    snicCompactness: new Form.Field()
        .notBlank()
        .number(),
}

class _SpatialSpeckleFilterOptionsPanel extends React.Component {
    render() {
        const {spatialSpeckleFilter, inputs} = this.props
        const fields = filterFields({spatialSpeckleFilter, inputs})
        
        return (
            <Layout>
                {fields.includes('kernelSize') ? this.renderKernelSize() : null}
                {fields.includes('sigma') ? this.renderSigma() : null}
                {fields.includes('snicSize') ? this.renderSnicOptions() : null}
                {fields.includes('strongScatterers') ? this.renderStrongScatterers() : null}
                {fields.includes('strongScattererValue1') ? this.renderStrongScattererValues() : null}
            </Layout>
        )
    }

    renderKernelSize() {
        const {inputs: {kernelSize}} = this.props
        return (
            <Form.Slider
                label={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.kernelSize.label')}
                input={kernelSize}
                minValue={KERNEL_SIZES[0]}
                maxValue={KERNEL_SIZES[KERNEL_SIZES.length - 1]}
                ticks={KERNEL_SIZES}
                snap
            />
        )
    }

    renderSigma() {
        const {inputs: {sigma}} = this.props
        return (
            <Form.Slider
                label={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.sigma.label')}
                input={sigma}
                minValue={0.5}
                maxValue={0.95}
                ticks={[0.5, 0.6, 0.7, 0.8, 0.9, 0.95]}
                decimals={2}
                snap
            />
        )
    }

    renderStrongScatterers() {
        const {inputs: {strongScatterers}} = this.props
        const options = [
            {
                value: 'RETAIN',
                label: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.strongScatterers.retain.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.strongScatterers.retain.tooltip')
            },
            {
                value: 'FILTER',
                label: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.strongScatterers.filter.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.strongScatterers.filter.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.strongScatterers.label')}
                input={strongScatterers}
                options={options}
            />
        )
    }

    renderStrongScattererValues() {
        const {inputs: {strongScattererValue1, strongScattererValue2}} = this.props
        return (
            <Layout type='horizontal-nowrap'>
                <Form.Input
                    label={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.strongScattererValue1.label')}
                    tooltip={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.strongScattererValue1.tooltip')}
                    input={strongScattererValue1}
                />
                <Form.Input
                    label={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.strongScattererValue2.label')}
                    tooltip={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.strongScattererValue2.tooltip')}
                    input={strongScattererValue2}
                />
            </Layout>
        )
    }

    renderSnicOptions() {
        const {inputs: {snicSize, snicCompactness}} = this.props
        return (
            <Layout>
                <Form.Slider
                    label={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.snicSize.label')}
                    tooltip={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.snicSize.tooltip')}
                    input={snicSize}
                    minValue={3}
                    maxValue={15}
                    ticks={KERNEL_SIZES}
                    snap
                />
                <Form.Slider
                    label={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.snicCompactness.label')}
                    tooltip={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.snicCompactness.tooltip')}
                    input={snicCompactness}
                    minValue={0}
                    maxValue={2}
                    scale='log'
                    ticks={[0, 0.15, 0.4, 0.7, 1, 1.5, 2]}
                    decimals={2}
                    info={value =>
                        msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.snicCompactness.value', {value})
                    }
                />
            </Layout>
        )
    }
}

const SpatialSpeckleFilterOptionsPanel = compose(
    _SpatialSpeckleFilterOptionsPanel,
    modalSubformPanel({
        id: 'spatialSpeckleFilterOptions',
        fields,
        toTitle: () => msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilterOptions.title'),
        toClassName: () => styles.spatialSpeckleFilterOptionsPanel,
    })
)

