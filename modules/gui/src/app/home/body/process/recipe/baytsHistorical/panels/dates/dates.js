import {Form} from 'widget/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {maxDate, minDate, momentDate} from 'widget/form/datePicker'
import {msg} from 'translate'
import React from 'react'
import moment from 'moment'
import styles from './dates.module.css'

const fields = {
    fromDate: new Form.Field(),
    toDate: new Form.Field()
}

class _Dates extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='calendar-alt'
                    title={msg('process.baytsHistorical.panel.dates.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderContents()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContents() {
        const {inputs: {fromDate, toDate}} = this.props
        const [fromStart, fromEnd] = fromDateRange(toDate.value)
        const [toStart, toEnd] = toDateRange(fromDate.value)
        return (
            <Layout type='horizontal'>
                <Form.DatePicker
                    label={msg('process.baytsHistorical.panel.dates.form.fromDate.label')}
                    input={fromDate}
                    startDate={fromStart}
                    endDate={fromEnd}/>
                <Form.DatePicker
                    label={msg('process.baytsHistorical.panel.dates.form.toDate.label')}
                    input={toDate}
                    startDate={toStart}
                    endDate={toEnd}/>
            </Layout>
        )
    }
}

const fromDateRange = toDate => {
    const dayBeforeToDate = momentDate(toDate).subtract(1, 'day')
    return [
        '2014-06-15',
        minDate(moment(), dayBeforeToDate)
    ]
}

const toDateRange = fromDate => {
    const dayAfterFromDate = momentDate(fromDate).add(1, 'day')
    return [
        maxDate('2014-06-15', dayAfterFromDate),
        moment()
    ]
}

export const Dates = compose(
    _Dates,
    recipeFormPanel({id: 'dates', fields})
)

Dates.propTypes = {}
