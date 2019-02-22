import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import moment from 'moment'
import React from 'react'
import {msg} from 'translate'
import DatePicker from 'widget/datePicker'
import {Constraint, ErrorMessage, Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import styles from './dates.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const fields = {
    startDate: new Field()
        .notBlank('process.timeSeries.panel.dates.form.startDate.required')
        .date(DATE_FORMAT, 'process.timeSeries.panel.dates.form.startDate.malformed'),

    endDate: new Field()
        .notBlank('process.timeSeries.panel.dates.form.endDate.required')
        .date(DATE_FORMAT, 'process.timeSeries.panel.dates.form.endDate.malformed')
}

const constraints = {
    startBeforeEnd: new Constraint(['startDate', 'endDate'])
        .skip(({endDate}) => !endDate)
        .predicate(({startDate, endDate}) => {
            return startDate < endDate
        }, 'process.timeSeries.panel.dates.form.startDate.beforeEnd')
}

class Dates extends React.Component {
    renderContent() {
        const {inputs: {startDate, endDate}} = this.props
        return (
            <React.Fragment>
                <div>
                    <DatePicker
                        label={msg('process.timeSeries.panel.dates.form.startDate.label')}
                        tooltip={msg('process.timeSeries.panel.dates.form.startDate.tooltip')}
                        tooltipPlacement='top'
                        input={startDate}
                        startDate={moment('1982-08-22', DATE_FORMAT)}
                        endDate={moment()}/>
                    <ErrorMessage for={[startDate, 'startBeforeEnd']}/>
                </div>
                <div>
                    <DatePicker
                        label={msg('process.timeSeries.panel.dates.form.endDate.label')}
                        tooltip={msg('process.timeSeries.panel.dates.form.endDate.tooltip')}
                        tooltipPlacement='top'
                        input={endDate}
                        startDate={startDate.isInvalid()
                            ? moment('1982-08-23', DATE_FORMAT)
                            : moment(startDate.value, DATE_FORMAT).add(1, 'days')}
                        endDate={moment()}/>
                    <ErrorMessage for={endDate}/>
                </div>
            </React.Fragment>
        )
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <PanelHeader
                    icon='cog'
                    title={msg('process.timeSeries.panel.dates.title')}/>

                <PanelContent>
                    <div className={styles.form}>
                        {this.renderContent()}
                    </div>
                </PanelContent>

                <FormPanelButtons/>
            </RecipeFormPanel>
        )
    }
}

Dates.propTypes = {}

export default recipeFormPanel({id: 'dates', fields, constraints})(Dates)
