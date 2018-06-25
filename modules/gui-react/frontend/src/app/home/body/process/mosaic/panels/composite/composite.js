import PropTypes from 'prop-types'
import React from 'react'
import {msg, Msg} from 'translate'
import Buttons from 'widget/buttons'
import {Constraints, form, Label} from 'widget/form'
import Slider from 'widget/slider'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import PanelForm from '../panelForm'
import styles from './composite.module.css'

const inputs = {
    corrections: new Constraints(),
    shadowPercentile: new Constraints(),
    hazePercentile: new Constraints(),
    ndviPercentile: new Constraints(),
    targetDayPercentile: new Constraints(),
    mask: new Constraints(),
    compose: new Constraints()
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        values: recipe('ui.compositeOptions')
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
            inputs: {corrections, shadowPercentile, hazePercentile, ndviPercentile, targetDayPercentile, mask, compose},
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
                                    label: 'Surface reflectance'
                                },
                                {
                                    value: 'BRDF',
                                    label: 'BRDF correction'
                                }
                            ]}/>
                        </div>
                        <div className={styles.filters}>
                            <Label>Pixel filters</Label>
                            <div className={styles.slider}>
                                <FilterLabel filter='shadow' percentile={shadowPercentile.value}/>
                                {/* <Slider input={shadowPercentile} steps={20}/> */}
                                <Slider input={shadowPercentile} ticks={[0, .05, .1, .25, .5, .75, .9, .95, 1]}/>
                            </div>

                            <div className={styles.slider}>
                                <FilterLabel filter='haze' percentile={hazePercentile.value}/>
                                <Slider input={hazePercentile} ticks={20}/>
                            </div>

                            <div className={styles.slider}>
                                <FilterLabel filter='ndvi' percentile={ndviPercentile.value}/>
                                <Slider input={ndviPercentile} ticks={20}/>
                            </div>

                            <div className={styles.slider}>
                                <FilterLabel filter='dayOfYear' percentile={targetDayPercentile.value}/>
                                <Slider input={targetDayPercentile} ticks={20}/>
                            </div>
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

const FilterLabel = ({filter, percentile}) => {
    let type = 'percentile'
    if (percentile === 0)
        type = 'off'
    else if (percentile === 100)
        type = 'max'
    return (
        <div className={styles.label}>
            <Msg id={['process.mosaic.panel.composite.form.filters', filter, type]} percentile={percentile}/>
        </div>
    )
}


Composite.propTypes = {
    recipeId: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({}),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Composite)
