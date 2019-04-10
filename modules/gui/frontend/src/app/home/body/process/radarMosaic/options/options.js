import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import PropTypes from 'prop-types'
import React from 'react'
import {selectFrom} from 'stateUtils'
import {msg} from 'translate'
import Buttons from 'widget/buttons'
import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {RecipeActions} from '../radarMosaicRecipe'
import styles from './options.module.css'

const fields = {
    corrections: new Field(),
    mask: new Field(),
    speckleFilter: new Field(),
    orbits: new Field()
}

class Options extends React.Component {
    renderContent() {
        const {
            inputs: {
                corrections, mask, speckleFilter, orbits
            }
        } = this.props
        return (
            <div className={styles.content}>
                <div>
                    <Buttons
                        label={msg('process.radarMosaic.panel.options.form.corrections.label')}
                        input={corrections}
                        multiple={true}
                        options={[{
                            value: 'GAMMA0',
                            label: msg('process.radarMosaic.panel.options.form.corrections.gamma0.label'),
                            tooltip: msg('process.radarMosaic.panel.options.form.corrections.surfaceRefgamma0lectance.tooltip')
                        }, {
                            value: 'TERRAIN',
                            label: msg('process.radarMosaic.panel.options.form.corrections.terrain.label'),
                            tooltip: msg('process.radarMosaic.panel.options.form.corrections.terrain.tooltip')
                        }]}
                    />
                </div>
                <div>
                    <Buttons
                        label={msg('process.radarMosaic.panel.options.form.mask.label')}
                        input={mask}
                        multiple={true}
                        options={[{
                            value: 'LAYOVER',
                            label: msg('process.radarMosaic.panel.options.form.mask.layover.label'),
                            tooltip: msg('process.radarMosaic.panel.options.form.mask.layover.tooltip')
                        }, {
                            value: 'OUTLIERS',
                            label: msg('process.radarMosaic.panel.options.form.mask.outliers.label'),
                            tooltip: msg('process.radarMosaic.panel.options.form.mask.outliers.tooltip')
                        }]}
                    />
                </div>
                <div>
                    <Buttons
                        label={msg('process.radarMosaic.panel.options.form.speckleFilter.label')}
                        input={speckleFilter}
                        options={[{
                            value: 'NONE',
                            label: msg('process.radarMosaic.panel.options.form.speckleFilter.none.label'),
                            tooltip: msg('process.radarMosaic.panel.options.form.speckleFilter.none.tooltip')
                        }, {
                            value: 'BOXCAR',
                            label: msg('process.radarMosaic.panel.options.form.speckleFilter.boxcar.label'),
                            tooltip: msg('process.radarMosaic.panel.options.form.speckleFilter.boxcar.tooltip')
                        }, {
                            value: 'REFINED_LEE',
                            label: msg('process.radarMosaic.panel.options.form.speckleFilter.refinedLee.label'),
                            tooltip: msg('process.radarMosaic.panel.options.form.speckleFilter.refinedLee.tooltip')
                        },]}
                    />
                </div>
                <div>
                    <Buttons
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
                </div>
            </div>
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

                <ScrollableContainer>
                    <Scrollable>
                        <PanelContent>
                            {this.renderContent()}
                        </PanelContent>
                    </Scrollable>
                </ScrollableContainer>

                <FormPanelButtons/>
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

const policy = ({values, wizardContext: {wizard}}) => {
    return wizard || selectFrom(values, 'dirty')
        ? {
            _: 'disallow',
            sceneSelection: 'allow'
        }
        : {
            _: 'allow-then-deactivate',
            sceneSelection: 'allow'
        }
}

const panelOptions = {
    id: 'options',
    fields,
    policy
}

export default recipeFormPanel(panelOptions)(
    Options
)
