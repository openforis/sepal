import moment from 'moment'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './dates.module.css'

const fields = {
    startYear: new Form.Field()
        .int(),
    endYear: new Form.Field()
        .int()
        .predicate((endYear, {startYear}) => endYear >= startYear, 'process.landTrendr.panel.dates.form.endYear.beforeStartYear')
}

class _Dates extends React.Component {
    render() {
        const {inputs: {startYear, endYear}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='calendar-alt'
                    title={msg('process.landTrendr.panel.dates.title')}/>
                <Panel.Content>
                    <Layout type='horizontal'>
                        <Form.YearPicker
                            label={msg('process.landTrendr.panel.dates.form.startYear.label')}
                            placement='above'
                            input={startYear}
                            startYear='1984'
                            endYear={moment().year()}/>
                        <Form.YearPicker
                            label={msg('process.landTrendr.panel.dates.form.endYear.label')}
                            placement='above'
                            input={endYear}
                            startYear={startYear.value || 1984}
                            endYear={moment().year()}/>
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
