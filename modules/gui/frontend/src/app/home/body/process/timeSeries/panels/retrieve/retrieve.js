import {FormButtons as Buttons} from 'widget/buttons'
import {Field} from 'widget/form'
import {FieldSet, PanelContent, PanelHeader} from 'widget/panel'
import {FormPanelButtons} from 'widget/formPanel'
import {RecipeActions} from '../../timeSeriesRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './retrieve.module.css'

const fields = {
    indicator: new Field()
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
            {value: 'NDVI', label: 'NDVI', tooltip: '(nir - red) / (nir + red)'},
            {value: 'NDMI', label: 'NDMI', tooltip: '(nir - swir1) / (nir + swir1)'},
            {value: 'NDWI', label: 'NDWI', tooltip: '(green - nir) / (green + nir)'},
            {value: 'NBR', label: 'NBR', tooltip: '(nir - swir2) / (nir + swir2)'},
            {value: 'EVI', label: 'EVI', tooltip: '2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1)'},
            {value: 'EVI2', label: 'EVI2', tooltip: '2.5 * (nir - red) / (nir + 2.4 * red + 1)'},
            {value: 'SAVI', label: 'SAVI', tooltip: '(1.5 * (nir - red) / (nir + red + 0.5)'}
        ]

        return (
            <FieldSet>
                <Buttons
                    label={msg('process.timeSeries.panel.retrieve.form.indicator.label')}
                    input={indicator}
                    multiple={false}
                    options={indicatorOptions}/>
            </FieldSet>
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
                <FormPanelButtons
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
