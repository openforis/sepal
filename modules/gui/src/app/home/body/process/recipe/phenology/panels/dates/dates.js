import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {maxDate, minDate, momentDate} from 'widget/form/datePicker'
import {msg} from 'translate'
import React from 'react'
import moment from 'moment'
import styles from './dates.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const fields = {
    fromYear: new Form.Field()
        .int(),
    toYear: new Form.Field()
        .int()
        .predicate((toYear, {fromYear}) => toYear >= fromYear, 'process.radarMosaic.panel.dates.form.toYear.beforeFromYear')
}

class Dates extends React.Component {
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

Dates.propTypes = {}

export default compose(
    Dates,
    recipeFormPanel({id: 'dates', fields})
)
