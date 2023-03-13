import {Button} from 'widget/button'
import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './options.module.css'

const fields = {
    advanced: new Form.Field(),
    orbits: new Form.Field()
        .notEmpty('process.recipeMosaic.panel.options.form.orbits.required'),
    orbitNumbers: new Form.Field(),
    geometricCorrection: new Form.Field(),
    spatialSpeckleFilter: new Form.Field(),
    kernelSize: new Form.Field(),
    targetKernelSize: new Form.Field(),
    sigma: new Form.Field(),
    strongScattererValue1: new Form.Field(),
    strongScattererValue2: new Form.Field(),
    multitemporalSpeckleFilter: new Form.Field(),
    numberOfImages: new Form.Field(),
    outlierRemoval: new Form.Field(),
    mask: new Form.Field(),
    minAngle: new Form.Field(),
    maxAngle: new Form.Field(),
    minObservations: new Form.Field(),
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

const KERNEL_SIZES = [3, 5, 7, 9, 11, 13, 15]
const TARGET_KERNEL_SIZES = [3, 5, 7]

class Options extends React.Component {
    render() {
        const {inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='layer-group'
                    title={msg('process.radarMosaic.panel.options.title')}/>
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

    renderAdvanced() {
        const {dates: {fromDate, toDate}, inputs: {mask, spatialSpeckleFilter}} = this.props
        return (
            <Layout>
                {this.renderOrbits()}
                {this.renderMask()}
                {mask.value?.includes('SIDES') ? this.renderMaskOptions() : null}
                {this.renderGeometricCorrection()}
                {this.renderSpatialSpeckleFilter()}
                {['BOXCAR', 'GAMMA_MAP', 'LEE_SIGMA', 'LEE', 'SNIC'].includes(spatialSpeckleFilter.value)
                    ? this.renderKernelSize()
                    : null}
                {spatialSpeckleFilter.value === 'LEE_SIGMA' ? this.renderTargetKernelSize() : null}
                {spatialSpeckleFilter.value === 'LEE_SIGMA' ? this.renderSigma() : null}
                {spatialSpeckleFilter.value === 'LEE_SIGMA' ? this.renderStrongScattererValues() : null}
                {this.usingSpatialSpeckleFilter() ? this.renderMultitemporalSpeckleFilter() : null}
                {this.usingMultitemporalSpeckleFilter() ? this.renderNumberOfImages() : null}
                {this.renderOutlierRemoval()}
                {this.renderOrbitNumbers()}
                {fromDate !== toDate ? this.renderMinObservations() : null}
            </Layout>
        )
    }

    renderSimple() {
        return (
            <Layout>
                {this.renderOrbits()}
                {this.renderGeometricCorrection()}
                {this.renderSpatialSpeckleFilter()}
                {this.usingSpatialSpeckleFilter() ? this.renderMultitemporalSpeckleFilter() : null}
                {this.renderOutlierRemoval()}
                {this.renderOrbitNumbers()}
            </Layout>
        )
    }

    renderOrbits() {
        const {inputs: {orbits}} = this.props
        const options = [
            {
                value: 'ASCENDING',
                label: msg('process.radarMosaic.panel.options.form.orbits.ascending.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.orbits.ascending.tooltip')
            },
            {
                value: 'DESCENDING',
                label: msg('process.radarMosaic.panel.options.form.orbits.descending.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.orbits.descending.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.radarMosaic.panel.options.form.orbits.label')}
                input={orbits}
                multiple={true}
                options={options}
            />
        )
    }

    renderOrbitNumbers() {
        const {inputs: {orbitNumbers}} = this.props
        const options = [
            {
                value: 'ALL',
                label: msg('process.radarMosaic.panel.options.form.orbitNumbers.all.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.orbitNumbers.all.tooltip')
            },
            {
                value: 'DOMINANT',
                label: msg('process.radarMosaic.panel.options.form.orbitNumbers.dominant.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.orbitNumbers.dominant.tooltip')
            },
            {
                value: 'ADJACENT',
                label: msg('process.radarMosaic.panel.options.form.orbitNumbers.adjacent.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.orbitNumbers.adjacent.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.radarMosaic.panel.options.form.orbitNumbers.label')}
                input={orbitNumbers}
                options={options}
            />
        )
    }

    renderGeometricCorrection() {
        const {inputs: {geometricCorrection}} = this.props
        const options = [
            {
                value: 'NONE',
                label: msg('process.radarMosaic.panel.options.form.geometricCorrection.none.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.geometricCorrection.none.tooltip')
            },
            {
                value: 'ELLIPSOID',
                label: msg('process.radarMosaic.panel.options.form.geometricCorrection.ellipsoid.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.geometricCorrection.ellipsoid.tooltip')
            },
            {
                value: 'TERRAIN',
                label: msg('process.radarMosaic.panel.options.form.geometricCorrection.terrain.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.geometricCorrection.terrain.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.radarMosaic.panel.options.form.geometricCorrection.label')}
                input={geometricCorrection}
                options={options}
            />
        )
    }

    renderSpatialSpeckleFilter() {
        const {inputs: {spatialSpeckleFilter}} = this.props
        const options = [
            {
                value: 'NONE',
                label: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.none.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.none.tooltip')
            },
            {
                value: 'BOXCAR',
                label: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.boxcar.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.boxcar.tooltip')
            },
            {
                value: 'GAMMA_MAP',
                label: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.gammaMap.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.gammaMap.tooltip')
            },
            {
                value: 'LEE',
                label: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.lee.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.lee.tooltip')
            },
            {
                value: 'REFINED_LEE',
                label: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.refinedLee.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.refinedLee.tooltip')
            },
            {
                value: 'LEE_SIGMA',
                label: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.leeSigma.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.leeSigma.tooltip')
            },
            {
                value: 'SNIC',
                label: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.snic.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.snic.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.radarMosaic.panel.options.form.spatialSpeckleFilter.label')}
                input={spatialSpeckleFilter}
                options={options}
            />
        )
    }

    renderKernelSize() {
        const {inputs: {spatialSpeckleFilter, kernelSize, targetKernelSize}} = this.props
        const minIndex = spatialSpeckleFilter.value === 'LEE_SIGMA'
            ? TARGET_KERNEL_SIZES.indexOf(targetKernelSize.value) + 1
            : 0
        return (
            <Form.Slider
                label={msg('process.radarMosaic.panel.options.form.kernelSize.label')}
                input={kernelSize}
                minValue={KERNEL_SIZES[minIndex]}
                maxValue={KERNEL_SIZES[KERNEL_SIZES.length - 1]}
                ticks={KERNEL_SIZES}
                snap
            />
        )
    }

    renderTargetKernelSize() {
        const {inputs: {targetKernelSize}} = this.props
        return (
            <Form.Slider
                label={msg('process.radarMosaic.panel.options.form.targetKernelSize.label')}
                input={targetKernelSize}
                minValue={TARGET_KERNEL_SIZES[0]}
                maxValue={TARGET_KERNEL_SIZES[TARGET_KERNEL_SIZES.length - 1]}
                ticks={TARGET_KERNEL_SIZES}
                snap
            />
        )
    }

    renderSigma() {
        const {inputs: {sigma}} = this.props
        return (
            <Form.Slider
                label={msg('process.radarMosaic.panel.options.form.sigma.label')}
                input={sigma}
                minValue={0.5}
                maxValue={0.95}
                ticks={[0.5, 0.6, 0.7, 0.8, 0.9, 0.95]}
                snap
            />
        )
    }

    renderStrongScattererValues() {
        const {inputs: {strongScattererValue1, strongScattererValue2}} = this.props
        return (
            <Layout type='horizontal-nowrap'>
                <Form.Input
                    label={msg('process.radarMosaic.panel.options.form.strontScatterValue.label', {band: 'VV'})}
                    tooltip={msg('process.radarMosaic.panel.options.form.strontScatterValue.tooltip', {band: 'VV'})}
                    input={strongScattererValue1}
                />
                <Form.Input
                    label={msg('process.radarMosaic.panel.options.form.strontScatterValue.label', {band: 'VH'})}
                    tooltip={msg('process.radarMosaic.panel.options.form.strontScatterValue.tooltip', {band: 'VH'})}
                    input={strongScattererValue2}
                />
            </Layout>
        )
    }

    renderMultitemporalSpeckleFilter() {
        const {inputs: {multitemporalSpeckleFilter}} = this.props
        const options = [
            {
                value: 'NONE',
                label: msg('process.radarMosaic.panel.options.form.multitemporalSpeckleFilter.none.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.multitemporalSpeckleFilter.none.tooltip')
            },
            {
                value: 'QUEGAN',
                label: msg('process.radarMosaic.panel.options.form.multitemporalSpeckleFilter.quegan.label'),
                tooltip: <React.Fragment>
                    {msg('process.radarMosaic.panel.options.form.multitemporalSpeckleFilter.quegan.tooltip')}
                    &nbsp;
                    <a target="_blank" rel="noopener noreferrer" href={'https://ieeexplore.ieee.org/document/842003'}>
                        <Icon name={'external-link-alt'}/>
                        &nbsp;Article
                    </a>
                </React.Fragment>
            },
            {
                value: 'RABASAR',
                label: msg('process.radarMosaic.panel.options.form.multitemporalSpeckleFilter.rabasar.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.multitemporalSpeckleFilter.rabasar.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.radarMosaic.panel.options.form.multitemporalSpeckleFilter.label')}
                input={multitemporalSpeckleFilter}
                options={options}
            />
        )
    }

    renderNumberOfImages() {
        const {inputs: {numberOfImages}} = this.props
        return (
            <Form.Slider
                label={msg('process.radarMosaic.panel.options.form.numberOfImages.label')}
                input={numberOfImages}
                minValue={2}
                maxValue={100}
                ticks={[1, 2, 5, 10, 20, 50, 100]}
                scale='log'
                info={value =>
                    msg('process.radarMosaic.panel.options.form.numberOfImages.value', {value})
                }
            />
        )
    }

    renderOutlierRemoval() {
        const {inputs: {outlierRemoval}} = this.props
        const options = [
            {
                value: 'NONE',
                label: msg('process.radarMosaic.panel.options.form.outlierRemoval.none.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.outlierRemoval.none.tooltip'),
            },
            {
                value: 'MODERATE',
                label: msg('process.radarMosaic.panel.options.form.outlierRemoval.moderate.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.outlierRemoval.moderate.tooltip')
            },
            {
                value: 'AGGRESSIVE',
                label: msg('process.radarMosaic.panel.options.form.outlierRemoval.aggressive.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.outlierRemoval.aggressive.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.radarMosaic.panel.options.form.outlierRemoval.label')}
                input={outlierRemoval}
                options={options}
            />
        )
    }

    renderMask() {
        const {inputs: {mask}} = this.props
        const options = [
            {
                value: 'SIDES',
                label: msg('process.radarMosaic.panel.options.form.mask.sides.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.mask.sides.tooltip')
            },
            {
                value: 'FIRST_LAST',
                label: msg('process.radarMosaic.panel.options.form.mask.firstLast.label'),
                tooltip: msg('process.radarMosaic.panel.options.form.mask.firstLast.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.radarMosaic.panel.options.form.mask.label')}
                input={mask}
                multiple={true}
                options={options}
            />
        )
    }

    renderMaskOptions() {
        const {inputs: {minAngle, maxAngle}} = this.props
        return (
            <Layout type='horizontal-nowrap'>
                <Form.Input
                    label={msg('process.radarMosaic.panel.options.form.minAngle.label')}
                    input={minAngle}
                />
                <Form.Input
                    label={msg('process.radarMosaic.panel.options.form.maxAngle.label')}
                    input={maxAngle}
                />
            </Layout>
        )
    }

    renderMinObservations() {
        const {inputs: {minObservations}} = this.props
        return (
            <Form.Slider
                label={msg('process.radarMosaic.panel.options.form.minObservations.label')}
                input={minObservations}
                minValue={1}
                maxValue={50}
                ticks={[1, 2, 5, 10, 20, 50]}
                scale='log'
                info={value =>
                    msg('process.radarMosaic.panel.options.form.minObservations.value', {value})
                }
            />
        )
    }

    componentDidUpdate(prevProps) {
        const {inputs: {targetKernelSize: prevTargetKernelSize}} = prevProps
        const {inputs: {spatialSpeckleFilter, kernelSize, targetKernelSize}} = this.props
        if (spatialSpeckleFilter.value === 'LEE_SIGMA' && kernelSize.value <= targetKernelSize.value) {
            const targetIndex = TARGET_KERNEL_SIZES.indexOf(targetKernelSize.value)
            const targetKernelSizeUpdated = prevTargetKernelSize.value !== targetKernelSize.value
            if (targetIndex === 0 || targetKernelSizeUpdated) {
                kernelSize.set(KERNEL_SIZES[targetIndex + 1])
            } else {
                targetKernelSize.set(TARGET_KERNEL_SIZES[targetIndex - 1])
            }
        }
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }

    usingSpatialSpeckleFilter() {
        const {inputs: {spatialSpeckleFilter}} = this.props
        return spatialSpeckleFilter.value && spatialSpeckleFilter.value !== 'NONE'
    }

    usingMultitemporalSpeckleFilter() {
        const {inputs: {multitemporalSpeckleFilter}} = this.props
        return multitemporalSpeckleFilter.value && multitemporalSpeckleFilter.value !== 'NONE'
    }

}

const modelToValues = model => {
    const [strongScattererValue1, strongScattererValue2] = model.strongScattererValues || [7, 2]
    return ({
        ...model,
        strongScattererValue1,
        strongScattererValue2
    })
}

const valuesToModel = values => ({
    advanced: values.advanced,
    orbits: values.orbits,
    orbitNumbers: values.orbitNumbers,
    geometricCorrection: values.geometricCorrection,
    spatialSpeckleFilter: values.spatialSpeckleFilter,
    kernelSize: parseInt(values.kernelSize),
    targetKernelSize: parseInt(values.targetKernelSize),
    sigma: parseFloat(values.sigma),
    strongScattererValues: [parseFloat(values.strongScattererValue1), parseFloat(values.strongScattererValue2)],
    multitemporalSpeckleFilter: values.multitemporalSpeckleFilter,
    numberOfImages: parseInt(values.numberOfImages),
    outlierRemoval: values.outlierRemoval,
    mask: values.mask,
    minAngle: parseFloat(values.minAngle),
    maxAngle: parseFloat(values.maxAngle),
    minObservations: values.minObservations,
})

Options.propTypes = {
    disabled: PropTypes.any,
    recipeId: PropTypes.string,
    sources: PropTypes.any
}

export default compose(
    Options,
    recipeFormPanel({id: 'options', fields, mapRecipeToProps, valuesToModel, modelToValues})
)
