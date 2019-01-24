import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import Buttons from 'widget/buttons'
import {Field, form} from 'widget/form'
import Label from 'widget/label'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Slider from 'widget/slider'
import styles from './compositeOptions.module.css'
import {RecipeActions, recipePath, RecipeState} from './landCoverRecipe'

const fields = {
    cloudThreshold: new Field(),
    corrections: new Field(),
    mask: new Field(),
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
    return {values}
}

class CompositeOptions extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {recipeId, form} = this.props
        return (
            <Panel
                className={styles.panel}
                statePath={recipePath(recipeId, 'ui')}
                form={form}
                onApply={values => this.recipeActions.setCompositeOptions({
                    values,
                    model: valuesToModel(values)
                }).dispatch()}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.landCover.panel.compositeOptions.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons/>
            </Panel>
        )
    }

    renderContent() {
        const {inputs: {cloudThreshold, corrections, mask}} = this.props
        return (
            <div className={styles.content}>
                <div>
                    <Label
                        msg={msg('process.landCover.panel.compositeOptions.form.cloudThreshold.label')}
                        tooltip={msg('process.landCover.panel.compositeOptions.form.cloudThreshold.tooltip')}
                        tooltipPlacement='topLeft'/>
                    <Slider
                        input={cloudThreshold}
                        minValue={0}
                        maxValue={100}
                        ticks={[0, 10, 25, 50, 75, 90, 100]}
                        snap
                        info={value => {
                            const type = value === 0 ? 'off' : value === 100 ? 'max' : 'value'
                            return msg(['process.landCover.panel.compositeOptions.form.cloudThreshold', type], {value})
                        }
                        }/>
                </div>
                <Buttons
                    label={msg('process.landCover.panel.compositeOptions.form.corrections.label')}
                    input={corrections}
                    multiple={true}
                    options={[
                        //     {
                        //     value: 'SR',
                        //     label: msg('process.landCover.panel.compositeOptions.form.corrections.surfaceReflectance.label'),
                        //     tooltip: msg('process.landCover.panel.compositeOptions.form.corrections.surfaceReflectance.tooltip')
                        // },
                        {
                            value: 'BRDF',
                            label: msg('process.landCover.panel.compositeOptions.form.corrections.brdf.label'),
                            tooltip: msg('process.landCover.panel.compositeOptions.form.corrections.brdf.tooltip')
                        }, {
                            value: 'Terrain',
                            label: msg('process.landCover.panel.compositeOptions.form.corrections.terrain.label'),
                            tooltip: msg('process.landCover.panel.compositeOptions.form.corrections.terrain.tooltip')
                        }]}
                />
                <Buttons
                    label={msg('process.landCover.panel.compositeOptions.form.mask.label')}
                    input={mask}
                    multiple={true}
                    options={[{
                        value: 'CLOUDS',
                        label: msg('process.landCover.panel.compositeOptions.form.mask.clouds.label'),
                        tooltip: msg('process.landCover.panel.compositeOptions.form.mask.clouds.tooltip')
                    }, {
                        value: 'HAZE',
                        label: msg('process.landCover.panel.compositeOptions.form.mask.haze.label'),
                        tooltip: msg('process.landCover.panel.compositeOptions.form.mask.haze.tooltip')
                    }, {
                        value: 'SHADOW',
                        label: msg('process.landCover.panel.compositeOptions.form.mask.shadow.label'),
                        tooltip: msg('process.landCover.panel.compositeOptions.form.mask.shadow.tooltip')
                    },
                        //     {
                        //     value: 'SNOW',
                        //     label: msg('process.landCover.panel.compositeOptions.form.mask.snow.label'),
                        //     tooltip: msg('process.landCover.panel.compositeOptions.form.mask.snow.tooltip')
                        // }
                    ]}
                />
            </div>
        )
    }
}

CompositeOptions.propTypes = {
    recipeId: PropTypes.string,
}

export default form({fields, mapStateToProps})(CompositeOptions)

const valuesToModel = values => ({
    ...values
})

const modelToValues = (model = {}) => ({
    ...model
})
