import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../../timeSeriesRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './retrieve.module.css'

const fields = {
    indicator: new Form.Field()
        .notEmpty('process.timeSeries.panel.retrieve.form.indicator.required')
}

class Retrieve extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    renderContent() {
        const {inputs: {indicator}} = this.props
        const indicatorOptions = [
            {value: 'ndvi', label: 'NDVI', tooltip: '(nir - red) / (nir + red)'},
            {value: 'ndmi', label: 'NDMI', tooltip: '(nir - swir1) / (nir + swir1)'},
            {value: 'ndwi', label: 'NDWI', tooltip: '(green - nir) / (green + nir)'},
            {value: 'ndfi', label: 'NDFI', tooltip: 'Normalized Difference Fraction Index'},
            {value: 'nbr', label: 'NBR', tooltip: '(nir - swir2) / (nir + swir2)'},
            {value: 'evi', label: 'EVI', tooltip: '2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1)'},
            {value: 'evi2', label: 'EVI2', tooltip: '2.5 * (nir - red) / (nir + 2.4 * red + 1)'},
            {value: 'savi', label: 'SAVI', tooltip: '(1.5 * (nir - red) / (nir + red + 0.5)'}
        ]

        return (
            <Layout>
                <Form.Buttons
                    label={msg('process.timeSeries.panel.retrieve.form.indicator.label')}
                    input={indicator}
                    multiple={false}
                    options={indicatorOptions}/>
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
                <PanelHeader
                    icon='cloud-download-alt'
                    title={msg('process.timeSeries.panel.retrieve.title')}/>
                <PanelContent>
                    {this.renderContent()}
                </PanelContent>
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
    recipeFormPanel({id: 'retrieve', fields})
)
