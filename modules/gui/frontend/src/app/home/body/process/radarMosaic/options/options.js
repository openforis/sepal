import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../radarMosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './options.module.css'

const fields = {
    orbits: new Form.Field()
        .notEmpty('process.recipeMosaic.panel.options.form.orbits.required'),
    geometricCorrection: new Form.Field(),
    speckleFilter: new Form.Field(),
    outlierRemoval: new Form.Field()
}

class Options extends React.Component {
    renderContent() {
        const {
            inputs: {
                orbits, geometricCorrection, speckleFilter, outlierRemoval
            }
        } = this.props
        return (
            <Layout>
                <Form.Buttons
                    label={msg('process.radarMosaic.panel.options.form.orbits.label')}
                    input={orbits}
                    multiple={true}
                    options={[{
                        value: 'ASCENDING',
                        label: msg('process.radarMosaic.panel.options.form.orbits.ascending.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.orbits.ascending.tooltip')
                    }, {
                        value: 'DESCENDING',
                        label: msg('process.radarMosaic.panel.options.form.orbits.descending.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.orbits.descending.tooltip')
                    }]}
                />
                <Form.Buttons
                    label={msg('process.radarMosaic.panel.options.form.geometricCorrection.label')}
                    input={geometricCorrection}
                    options={[{
                        value: 'NONE',
                        label: msg('process.radarMosaic.panel.options.form.geometricCorrection.none.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.geometricCorrection.none.tooltip')
                    }, {
                        value: 'ELLIPSOID',
                        label: msg('process.radarMosaic.panel.options.form.geometricCorrection.ellipsoid.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.geometricCorrection.ellipsoid.tooltip')
                    }, {
                        value: 'TERRAIN',
                        label: msg('process.radarMosaic.panel.options.form.geometricCorrection.terrain.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.geometricCorrection.terrain.tooltip')
                    }]}
                />
                <Form.Buttons
                    label={msg('process.radarMosaic.panel.options.form.speckleFilter.label')}
                    input={speckleFilter}
                    options={[{
                        value: 'NONE',
                        label: msg('process.radarMosaic.panel.options.form.speckleFilter.none.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.speckleFilter.none.tooltip')
                    // }, {
                    //     value: 'BOXCAR',
                    //     label: msg('process.radarMosaic.panel.options.form.speckleFilter.boxcar.label'),
                    //     tooltip: msg('process.radarMosaic.panel.options.form.speckleFilter.boxcar.tooltip')
                    }, {
                        value: 'SNIC',
                        label: msg('process.radarMosaic.panel.options.form.speckleFilter.snic.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.speckleFilter.snic.tooltip')
                    }, {
                        value: 'REFINED_LEE',
                        label: msg('process.radarMosaic.panel.options.form.speckleFilter.refinedLee.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.speckleFilter.refinedLee.tooltip')
                    }]}
                />
                <Form.Buttons
                    label={msg('process.radarMosaic.panel.options.form.outlierRemoval.label')}
                    input={outlierRemoval}
                    options={[{
                        value: 'NONE',
                        label: msg('process.radarMosaic.panel.options.form.outlierRemoval.none.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.outlierRemoval.none.tooltip'),
                    }, {
                        value: 'MODERATE',
                        label: msg('process.radarMosaic.panel.options.form.outlierRemoval.moderate.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.outlierRemoval.moderate.tooltip')
                    }, {
                        value: 'AGGRESSIVE',
                        label: msg('process.radarMosaic.panel.options.form.outlierRemoval.aggressive.label'),
                        tooltip: msg('process.radarMosaic.panel.options.form.outlierRemoval.aggressive.tooltip')
                    }]}
                />
            </Layout>
        )
    }

    render() {
        const {recipeId} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'
                onClose={() => RecipeActions(recipeId).showPreview().dispatch()}>
                <PanelHeader
                    icon='layer-group'
                    title={msg('process.radarMosaic.panel.options.title')}/>
                <PanelContent>
                    {this.renderContent()}
                </PanelContent>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }
}

Options.propTypes = {
    disabled: PropTypes.any,
    recipeId: PropTypes.string,
    sources: PropTypes.any
}

const panelOptions = {
    id: 'options',
    fields
}

export default compose(
    Options,
    recipeFormPanel(panelOptions)
)
