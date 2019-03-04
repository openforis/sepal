import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../../timeSeriesRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {msg} from 'translate'
import Buttons from 'widget/buttons'
import Label from 'widget/label'
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
            {value: 'NDVI', label: 'NDVI'},
            {value: 'NDMI', label: 'NDMI'},
            {value: 'NBR', label: 'NBR'},
            {value: 'EVI', label: 'EVI'},
            {value: 'EVI2', label: 'EVI2'}
        ]

        return (
            <div className={styles.form}>
                <div>
                    <Label msg={msg('process.timeSeries.panel.retrieve.form.indicator.label')}/>
                    <Buttons
                        input={indicator}
                        multiple={false}
                        options={indicatorOptions}/>
                </div>
            </div>
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

export default recipeFormPanel({id: 'retrieve', fields})(Retrieve)
