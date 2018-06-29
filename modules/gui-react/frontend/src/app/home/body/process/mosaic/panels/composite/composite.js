import PropTypes from 'prop-types'
import React from 'react'
import {msg, Msg} from 'translate'
import Buttons from 'widget/buttons'
import {Field, form, Label} from 'widget/form'
import Slider from 'widget/slider'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import PanelForm from '../panelForm'
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
    const recipe = RecipeState(ownProps.recipeId)
    return {
        values: recipe('ui.compositeOptions'),
        source: Object.keys(recipe('sources'))[0]
    }
}

class Composite extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        const {
            recipeId,
            form,
            inputs: {corrections, shadowPercentile, hazePercentile, ndviPercentile, dayOfYearPercentile, mask, compose},
            source,
            className
        } = this.props

        return (
            <form className={[className, styles.container].join(' ')}>
                <PanelForm
                    recipeId={recipeId}
                    form={form}
                    onApply={(recipe, options) => recipe.setCompositeOptions(options).dispatch()}
                    icon='cog'
                    title={msg('process.mosaic.panel.composite.title')}>
                    <div className={styles.form}>
                        <div className={styles.corrections}>
                            <Label>Corrections</Label>
                            <Buttons input={corrections} multiple={true} options={[
                                {
                                    value: 'SR',
                                    label: 'Surface reflectance',
                                    disabled: source !== 'landsat'
                                },
                                {
                                    value: 'BRDF',
                                    label: 'BRDF correction',
                                    disabled: source !== 'landsat'
                                }
                            ]}/>
                        </div>
                        <div className={styles.filters}>
                            <Label>Pixel filters</Label>
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
                                    label: 'Clouds',
                                    // tooltip: ['process.mosaic.panel.sources.form.dataSets.options']
                                },
                                {
                                    value: 'SNOW',
                                    label: 'Snow',
                                    // tooltip: ['process.mosaic.panel.sources.form.dataSets.options']
                                },
                            ]}/>
                        </div>
                        <div className={styles.compose}>
                            <Label>Composing method</Label>
                            <Buttons input={compose} options={[
                                {
                                    value: 'MEDOID',
                                    label: 'Medoid',
                                    // tooltip: ['process.mosaic.panel.sources.form.dataSets.options']
                                },
                                {
                                    value: 'MEDIAN',
                                    label: 'Median',
                                    // tooltip: ['process.mosaic.panel.sources.form.dataSets.options']
                                },
                            ]}/>
                        </div>
                    </div>
                </PanelForm>
            </form>
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
    className: PropTypes.string,
    form: PropTypes.object,
    fields: PropTypes.object,
    action: PropTypes.func,
    values: PropTypes.object
}

export default form({fields, mapStateToProps})(Composite)
