import {Button} from 'widget/button'
import {Form} from 'widget/form/form'
import {Icon} from 'widget/icon'
import {Layout} from 'widget/layout'
import {MaskOptions} from './maskOptions'
import {MultitemporalSpeckleFilterOptions} from './multitemporalSpeckleFilterOptions'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {SpatialSpeckleFilterOptions} from './spatialSpeckleFilterOptions'
import {compose} from 'compose'
import {msg} from 'translate'
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
    sigma: new Form.Field(),
    strongScatterers: new Form.Field(),
    strongScattererValue1: new Form.Field(),
    strongScattererValue2: new Form.Field(),
    snicSize: new Form.Field(),
    snicCompactness: new Form.Field(),
    multitemporalSpeckleFilter: new Form.Field(),
    numberOfImages: new Form.Field(),
    outlierRemoval: new Form.Field(),
    mask: new Form.Field(),
    minAngle: new Form.Field(),
    maxAngle: new Form.Field(),
    minObservations: new Form.Field(),
}

class Options extends React.Component {
    render() {
        const {inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='layer-group'
                    title={msg('process.baytsHistorical.panel.options.title')}/>
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
        const {monitor, inputs: {mask}} = this.props
        return (
            <Layout>
                {this.renderOrbits()}
                {this.renderMask()}
                {mask.value?.includes('SIDES') ? this.renderMaskOptions() : null}
                {this.renderGeometricCorrection()}
                {this.renderSpatialSpeckleFilter()}
                {this.usingSpatialSpeckleFilter() ? this.renderSpatialSpeckleFilterOptions() : null}
                {this.usingSpatialSpeckleFilter() ? this.renderMultitemporalSpeckleFilter() : null}
                {!monitor && this.usingMultitemporalSpeckleFilter() ? this.renderMultitemporalSpeckleFilterOptions() : null}
                {!monitor ? this.renderOutlierRemoval() : null}
                {!monitor ? this.renderMinObservations() : null}
            </Layout>
        )
    }

    renderSimple() {
        const {monitor} = this.props
        return (
            <Layout>
                {this.renderOrbits()}
                {this.renderGeometricCorrection()}
                {this.renderSpatialSpeckleFilter()}
                {this.usingSpatialSpeckleFilter() ? this.renderMultitemporalSpeckleFilter() : null}
                {!monitor ? this.renderOutlierRemoval() : null}
            </Layout>
        )
    }

    renderOrbits() {
        const {inputs: {orbits}} = this.props
        const options = [
            {
                value: 'ASCENDING',
                label: msg('process.baytsHistorical.panel.options.form.orbits.ascending.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.orbits.ascending.tooltip')
            },
            {
                value: 'DESCENDING',
                label: msg('process.baytsHistorical.panel.options.form.orbits.descending.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.orbits.descending.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.baytsHistorical.panel.options.form.orbits.label')}
                input={orbits}
                multiple
                options={options}
            />
        )
    }

    renderGeometricCorrection() {
        const {inputs: {geometricCorrection}} = this.props
        const options = [
            {
                value: 'NONE',
                label: msg('process.baytsHistorical.panel.options.form.geometricCorrection.none.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.geometricCorrection.none.tooltip')
            },
            {
                value: 'ELLIPSOID',
                label: msg('process.baytsHistorical.panel.options.form.geometricCorrection.ellipsoid.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.geometricCorrection.ellipsoid.tooltip')
            },
            {
                value: 'TERRAIN',
                label: msg('process.baytsHistorical.panel.options.form.geometricCorrection.terrain.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.geometricCorrection.terrain.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.baytsHistorical.panel.options.form.geometricCorrection.label')}
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
                label: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.none.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.none.tooltip')
            },
            // {
            //     value: 'BOXCAR',
            //     label: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.boxcar.label'),
            //     tooltip: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.boxcar.tooltip')
            // },
            {
                value: 'GAMMA_MAP',
                label: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.gammaMap.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.gammaMap.tooltip')
            },
            {
                value: 'LEE',
                label: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.lee.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.lee.tooltip')
            },
            {
                value: 'REFINED_LEE',
                label: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.refinedLee.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.refinedLee.tooltip')
            },
            {
                value: 'LEE_SIGMA',
                label: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.leeSigma.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.leeSigma.tooltip')
            },
            {
                value: 'SNIC',
                label: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.snic.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.snic.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.baytsHistorical.panel.options.form.spatialSpeckleFilter.label')}
                input={spatialSpeckleFilter}
                options={options}
            />
        )
    }

    renderSpatialSpeckleFilterOptions() {
        const {inputs: {spatialSpeckleFilter, kernelSize, sigma, strongScatterers, strongScattererValue1, strongScattererValue2, snicSize, snicCompactness}} = this.props
        return (
            <SpatialSpeckleFilterOptions
                spatialSpeckleFilter={spatialSpeckleFilter.value}
                inputs={{kernelSize, sigma, strongScatterers, strongScattererValue1, strongScattererValue2, snicSize, snicCompactness}}
            />
        )
    }

    renderMultitemporalSpeckleFilter() {
        const {inputs: {multitemporalSpeckleFilter}} = this.props
        const options = [
            {
                value: 'NONE',
                label: msg('process.baytsHistorical.panel.options.form.multitemporalSpeckleFilter.none.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.multitemporalSpeckleFilter.none.tooltip')
            },
            {
                value: 'QUEGAN',
                label: msg('process.baytsHistorical.panel.options.form.multitemporalSpeckleFilter.quegan.label'),
                tooltip: <React.Fragment>
                    {msg('process.baytsHistorical.panel.options.form.multitemporalSpeckleFilter.quegan.tooltip')}
                    &nbsp;
                    <a target="_blank" rel="noopener noreferrer" href={'https://ieeexplore.ieee.org/document/842003'}>
                        <Icon name={'external-link-alt'}/>
                        &nbsp;Article
                    </a>
                </React.Fragment>
            },
            {
                value: 'RABASAR',
                label: msg('process.baytsHistorical.panel.options.form.multitemporalSpeckleFilter.rabasar.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.multitemporalSpeckleFilter.rabasar.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.baytsHistorical.panel.options.form.multitemporalSpeckleFilter.label')}
                input={multitemporalSpeckleFilter}
                options={options}
            />
        )
    }

    renderMultitemporalSpeckleFilterOptions() {
        const {inputs: {spatialSpeckleFilter, multitemporalSpeckleFilter, numberOfImages}} = this.props
        return (
            <MultitemporalSpeckleFilterOptions
                spatialSpeckleFilter={spatialSpeckleFilter.value}
                multitemporalSpeckleFilter={multitemporalSpeckleFilter.value}
                inputs={{numberOfImages}}
            />
        )
    }

    renderOutlierRemoval() {
        const {inputs: {outlierRemoval}} = this.props
        const options = [
            {
                value: 'NONE',
                label: msg('process.baytsHistorical.panel.options.form.outlierRemoval.none.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.outlierRemoval.none.tooltip'),
            },
            {
                value: 'MODERATE',
                label: msg('process.baytsHistorical.panel.options.form.outlierRemoval.moderate.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.outlierRemoval.moderate.tooltip')
            },
            {
                value: 'AGGRESSIVE',
                label: msg('process.baytsHistorical.panel.options.form.outlierRemoval.aggressive.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.outlierRemoval.aggressive.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.baytsHistorical.panel.options.form.outlierRemoval.label')}
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
                label: msg('process.baytsHistorical.panel.options.form.mask.sides.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.mask.sides.tooltip')
            },
            {
                value: 'FIRST_LAST',
                label: msg('process.baytsHistorical.panel.options.form.mask.firstLast.label'),
                tooltip: msg('process.baytsHistorical.panel.options.form.mask.firstLast.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.baytsHistorical.panel.options.form.mask.label')}
                input={mask}
                multiple
                options={options}
            />
        )
    }

    renderMaskOptions() {
        const {inputs: {minAngle, maxAngle}} = this.props
        return (
            <MaskOptions inputs={{minAngle, maxAngle}}/>
        )
    }

    renderMinObservations() {
        const {inputs: {minObservations}} = this.props
        return (
            <Form.Slider
                label={msg('process.baytsHistorical.panel.options.form.minObservations.label')}
                input={minObservations}
                minValue={1}
                maxValue={50}
                ticks={[1, 2, 5, 10, 20, 50]}
                scale='log'
                info={value =>
                    msg('process.baytsHistorical.panel.options.form.minObservations.value', {value})
                }
            />
        )
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }

    usingSpatialSpeckleFilter() {
        const {inputs: {spatialSpeckleFilter}} = this.props
        return spatialSpeckleFilter.value
            && spatialSpeckleFilter.value !== 'NONE'
    }

    usingMultitemporalSpeckleFilter() {
        const {inputs: {multitemporalSpeckleFilter}} = this.props
        return this.usingSpatialSpeckleFilter()
            && multitemporalSpeckleFilter.value
            && multitemporalSpeckleFilter.value !== 'NONE'
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
    sigma: parseFloat(values.sigma),
    snicSize: parseInt(values.snicSize),
    snicCompactness: parseFloat(values.snicCompactness),
    strongScatterers: values.strongScatterers,
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
    monitor: PropTypes.any

}

export default compose(
    Options,
    recipeFormPanel({id: 'options', fields, valuesToModel, modelToValues})
)
