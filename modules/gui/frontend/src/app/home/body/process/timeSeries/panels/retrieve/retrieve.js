import {Field, Label, form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from '../../timeSeriesRecipe'
import {msg} from 'translate'
import {recipePath} from 'app/home/body/process/timeSeries/timeSeriesRecipe'
import Buttons from 'widget/buttons'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './retrieve.module.css'

const fields = {
    indicator: new Field()
        .notEmpty('process.timeSeries.panel.retrieve.form.indicator.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        values: recipeState('ui.retrieveOptions')
    }
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
        const {recipeId, form} = this.props
        return (
            <Panel
                className={styles.panel}
                form={form}
                statePath={recipePath(recipeId, 'ui')}
                isActionForm={true}
                onApply={values => this.recipeActions.retrieve(values).dispatch()}>
                <PanelHeader
                    icon='cloud-download-alt'
                    title={msg('process.timeSeries.panel.retrieve.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons
                    applyLabel={msg('process.timeSeries.panel.retrieve.apply')}/>
            </Panel>
        )
    }
}

Retrieve.propTypes = {
    recipeId: PropTypes.string
}

export default form({fields, mapStateToProps})(Retrieve)
