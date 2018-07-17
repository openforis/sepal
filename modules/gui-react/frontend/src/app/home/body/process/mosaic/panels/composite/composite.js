import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import PropTypes from 'prop-types'
import React from 'react'
import {msg, Msg} from 'translate'
import Buttons from 'widget/buttons'
import {Field, form, Label} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Slider from 'widget/slider'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import styles from './composite.module.css'

const fields = {
    corrections: new Field(),
    shadowPercentile: new Field(),
    hazePercentile: new Field(),
    ndviPercentile: new Field(),
    dayOfYearPercentile: new Field(),
    mask: new Field(),
    compose: new Field()
}

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        values: recipeState('ui.compositeOptions'),
        source: Object.keys(recipeState('model.sources'))[0]
    }
}

class Composite extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    renderContent() {
        const {
            inputs: {
                corrections, shadowPercentile, hazePercentile, ndviPercentile, dayOfYearPercentile, mask, compose
            },
            source
        } = this.props
        return (
            <div className={styles.content}>
                <div className={styles.corrections}>
                    <Label>Corrections</Label>
                    <Buttons input={corrections} multiple={true} options={[
                        {
                            value: 'SR',
                            label: msg('process.mosaic.panel.composite.form.surfaceReflectance.label'),
                            tooltip: 'process.mosaic.panel.composite.form.surfaceReflectance',
                            disabled: source !== 'landsat'
                        },
                        {
                            value: 'BRDF',
                            label: msg('process.mosaic.panel.composite.form.brdf.label'),
                            tooltip: 'process.mosaic.panel.composite.form.brdf',
                            disabled: source !== 'landsat'
                        }
                    ]}/>
                </div>
                <div className={styles.filters}>
                    <Label tooltip={'process.mosaic.panel.composite.form.filters'}>
                        <Msg id='process.mosaic.panel.composite.form.filters.label'/>
                    </Label>
                    <PercentileField input={shadowPercentile}/>
                    <PercentileField
                        input={hazePercentile}
                        disabled={source === 'landsat' && corrections.value.includes('SR')}/>
                    <PercentileField input={ndviPercentile}/>
                    <PercentileField input={dayOfYearPercentile}/>
                </div>
                <div className={styles.mask}>
                    <Label>Mask</Label>
                    <Buttons input={mask} multiple={true} options={[
                        {
                            value: 'CLOUDS',
                            label: msg('process.mosaic.panel.composite.form.clouds.label'),
                            tooltip: 'process.mosaic.panel.composite.form.clouds'
                        },
                        {
                            value: 'SNOW',
                            label: msg('process.mosaic.panel.composite.form.snow.label'),
                            tooltip: 'process.mosaic.panel.composite.form.snow'
                        },
                    ]}/>
                </div>
                <div className={styles.compose}>
                    <Label>Composing method</Label>
                    <Buttons input={compose} options={[
                        {
                            value: 'MEDOID',
                            label: msg('process.mosaic.panel.composite.form.medoid.label'),
                            tooltip: 'process.mosaic.panel.composite.form.medoid'
                        },
                        {
                            value: 'MEDIAN',
                            label: msg('process.mosaic.panel.composite.form.median.label'),
                            tooltip: 'process.mosaic.panel.composite.form.median'
                        },
                    ]}/>
                </div>
            </div>
        )
    }

    render() {
        const {recipeId, form} = this.props
        return (
                <Panel className={styles.panel}>
                    <PanelHeader
                        icon='cog'
                        title={msg('process.mosaic.panel.composite.title')}/>

                    <PanelContent>
                        {this.renderContent()}
                    </PanelContent>

                    <PanelButtons
                        statePath={recipePath(recipeId, 'ui')}
                        form={form}
                        onApply={(options) => this.recipeActions.setCompositeOptions(options).dispatch()}/>
                </Panel>
        )
    }
}

const PercentileField = ({input, disabled = false}) => {
    const percentile = input.value
    let type = 'percentile'
    if (percentile === 0)
        type = 'off'
    else if (percentile === 100)
        type = 'max'
    return (
        <div className={[styles.slider, disabled ? styles.disabled : null].join(' ')}>
            <div className={styles.label}>
                <Msg id={['process.mosaic.panel.composite.form.filters', input.name, type]} percentile={percentile}/>
            </div>
            <Slider input={input} ticks={[0, .05, .1, .25, .5, .75, .9, .95, 1]}/>
            <div className={disabled ? styles.disabledOverlay : null}/>
        </div>
    )
}

Composite.propTypes = {
    recipeId: PropTypes.string,
    form: PropTypes.object,
    fields: PropTypes.object,
    action: PropTypes.func,
    values: PropTypes.object
}

export default form({fields, mapStateToProps})(Composite)
