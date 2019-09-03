import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {selectFrom} from 'stateUtils'
import {msg} from 'translate'
import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from '../../timeSeriesRecipe'
import styles from './retrieve.module.css'

const fields = {
    indicator: new Form.Field()
        .notEmpty('process.timeSeries.panel.retrieve.form.indicator.required'),
    scale: new Form.Field(),
}

const mapRecipeToProps = recipe => ({
    sources: selectFrom(recipe, 'model.sources')
})

class Retrieve extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId, inputs: {scale}} = this.props
        this.recipeActions = RecipeActions(recipeId)
        if (!scale.value)
            scale.set(30)
    }

    renderContent() {
        const {sources, inputs: {indicator, scale}} = this.props
        const indicatorOptions = _.isEmpty(sources['SENTINEL_1'])
            ? [
                {value: 'ndvi', label: 'NDVI', tooltip: '(nir - red) / (nir + red)'},
                {value: 'ndmi', label: 'NDMI', tooltip: '(nir - swir1) / (nir + swir1)'},
                {value: 'ndwi', label: 'NDWI', tooltip: '(green - nir) / (green + nir)'},
                {value: 'ndfi', label: 'NDFI', tooltip: 'Normalized Difference Fraction Index'},
                {value: 'nbr', label: 'NBR', tooltip: '(nir - swir2) / (nir + swir2)'},
                {value: 'evi', label: 'EVI', tooltip: '2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1)'},
                {value: 'evi2', label: 'EVI2', tooltip: '2.5 * (nir - red) / (nir + 2.4 * red + 1)'},
                {value: 'savi', label: 'SAVI', tooltip: '(1.5 * (nir - red) / (nir + red + 0.5)'}
            ]
            : [
                {value: 'VV', label: 'VV'},
                {value: 'VH', label: 'VH'},
                {value: 'VV/VH', label: 'VV/VH'}
            ]

        return (
            <Layout>
                <Form.Buttons
                    label={msg('process.timeSeries.panel.retrieve.form.indicator.label')}
                    input={indicator}
                    multiple={false}
                    options={indicatorOptions}/>
                <Form.Slider
                    label={msg('process.radarMosaic.panel.retrieve.form.scale.label')}
                    info={scale => msg('process.timeSeries.panel.retrieve.form.scale.info', {scale})}
                    input={scale}
                    minValue={10}
                    maxValue={100}
                    scale={'log'}
                    ticks={[10, 15, 20, 30, 60, 100]}
                    snap
                    range='none'
                />
            </Layout>
        )
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={values => this.recipeActions.retrieve(values).dispatch()}>
                <Panel.Header
                    icon='cloud-download-alt'
                    title={msg('process.timeSeries.panel.retrieve.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons
                    applyLabel={msg('process.timeSeries.panel.retrieve.apply')}/>
            </RecipeFormPanel>
        )
    }
}

Retrieve.propTypes = {
    recipeId: PropTypes.string
}

export default compose(
    Retrieve,
    recipeFormPanel({id: 'retrieve', fields, mapRecipeToProps})
)
