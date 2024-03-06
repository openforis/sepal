import {Form} from 'widget/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import moment from 'moment'
import styles from './dates.module.css'

const fields = {
    fromYear: new Form.Field()
        .int(),
    toYear: new Form.Field()
        .int()
        .predicate((toYear, {fromYear}) => toYear >= fromYear, 'process.radarMosaic.panel.dates.form.toYear.beforeFromYear')
}

class _Dates extends React.Component {
    renderYears() {
        const {inputs: {fromYear, toYear}} = this.props
        return (
            <Layout type='horizontal'>
                <Form.YearPicker
                    label={msg('process.phenology.panel.dates.form.fromYear.label')}
                    placement='above'
                    input={fromYear}
                    startYear='1982'
                    endYear={moment().year()}/>
                <Form.YearPicker
                    label={msg('process.phenology.panel.dates.form.toYear.label')}
                    placement='above'
                    input={toYear}
                    startYear={fromYear.value || 1982}
                    endYear={moment().year()}/>
            </Layout>
        )
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='calendar-alt'
                    title={msg('process.phenology.panel.dates.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderYears()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }
}

export const Dates = compose(
    _Dates,
    recipeFormPanel({id: 'dates', fields})
)

Dates.propTypes = {}
