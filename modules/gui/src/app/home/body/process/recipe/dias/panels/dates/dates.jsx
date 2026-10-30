import moment from 'moment'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './dates.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const fields = {
    startDate: new Form.Field()
        .notBlank('process.dias.panel.dates.form.startDate.required')
        .date(DATE_FORMAT, 'process.dias.panel.dates.form.startDate.malformed'),

    endDate: new Form.Field()
        .notBlank('process.dias.panel.dates.form.endDate.required')
        .date(DATE_FORMAT, 'process.dias.panel.dates.form.endDate.malformed')
}

const constraints = {
    startBeforeEnd: new Form.Constraint(['startDate', 'endDate'])
        .skip(({endDate}) => !endDate)
        .predicate(({startDate, endDate}) => startDate < endDate,
            'process.dias.panel.dates.form.startDate.beforeEnd')
}

class _Dates extends React.Component {
    renderContent() {
        const {inputs: {startDate, endDate}} = this.props
        return (
            <Form.FieldSet
                layout='horizontal'
                errorMessage={[startDate, endDate, 'startBeforeEnd']}>
                <Form.DatePicker
                    label={msg('process.dias.panel.dates.form.startDate.label')}
                    tooltip={msg('process.dias.panel.dates.form.startDate.tooltip')}
                    tooltipPlacement='top'
                    input={startDate}
                    startDate='2014-04-03'
                    endDate={moment()}
                />
                <Form.DatePicker
                    label={msg('process.dias.panel.dates.form.endDate.label')}
                    tooltip={msg('process.dias.panel.dates.form.endDate.tooltip')}
                    tooltipPlacement='top'
                    input={endDate}
                    startDate={startDate.isInvalid()
                        ? '2014-04-04'
                        : moment(startDate.value, DATE_FORMAT).add(1, 'days')}
                    endDate={moment()}
                />
            </Form.FieldSet>
        )
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='calendar-alt'
                    title={msg('process.dias.panel.dates.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderContent()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }
}

export const Dates = compose(
    _Dates,
    recipeFormPanel({id: 'dates', fields, constraints})
)

Dates.propTypes = {}
