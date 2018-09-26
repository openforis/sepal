import {Field, Label, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import Buttons from 'widget/buttons'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import Slider from 'widget/slider'
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
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.compositeOptions')
    if (!values) {
        const model = recipeState('model.compositeOptions')
        values = modelToValues(model)
        RecipeActions(recipeId).setCompositeOptions({values, model}).dispatch()
    }
    return {
        values,
        source: recipeState.source()
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
                            disabled: source !== 'LANDSAT'
                        },
                        {
                            value: 'BRDF',
                            label: msg('process.mosaic.panel.composite.form.brdf.label'),
                            tooltip: 'process.mosaic.panel.composite.form.brdf',
                            disabled: source !== 'LANDSAT'
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
                        disabled={source === 'LANDSAT' && corrections.value.includes('SR')}/>
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
                    form={form}
                    statePath={recipePath(recipeId, 'ui')}
                    onApply={values => this.recipeActions.setCompositeOptions({
                        values,
                        model: valuesToModel(values)
                    }).dispatch()}/>
            </Panel>
        )
    }
}

Composite.propTypes = {
    disabled: PropTypes.any,
    recipeId: PropTypes.string,
    source: PropTypes.string
}

export default form({fields, mapStateToProps})(Composite)

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
            <Slider input={input} minValue={0} maxValue={100} ticks={[0, 10, 25, 50, 75, 90, 100]} showTickLabels={false}/>
            <div className={disabled ? styles.disabledOverlay : null}/>
        </div>
    )
}

PercentileField.propTypes = {
    disabled: PropTypes.any,
    input: PropTypes.object
}

const valuesToModel = (values) => ({
    corrections: values.corrections,
    filters: [
        {type: 'SHADOW', percentile: values.shadowPercentile},
        {type: 'HAZE', percentile: values.hazePercentile},
        {type: 'NDVI', percentile: values.ndviPercentile},
        {type: 'DAY_OF_YEAR', percentile: values.dayOfYearPercentile},
    ].filter(({percentile}) => percentile),
    mask: values.mask,
    compose: values.compose,
})

const modelToValues = (model) => {
    const getPercentile = (type) => {
        const filter = model.filters.find(filter => filter.type === type)
        return filter ? filter.percentile : 0
    }
    return ({
        corrections: model.corrections,
        shadowPercentile: getPercentile('SHADOW'),
        hazePercentile: getPercentile('HAZE'),
        ndviPercentile: getPercentile('NDVI'),
        dayOfYearPercentile: getPercentile('DAY_OF_YEAR'),
        mask: model.mask,
        compose: model.compose,
    })
}
