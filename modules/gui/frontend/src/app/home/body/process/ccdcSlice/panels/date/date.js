import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import moment from 'moment'
import styles from './date.module.css'
import {selectFrom} from '../../../../../../../stateUtils'

const DATE_FORMAT = 'YYYY-MM-DD'

const fields = {
    date: new Form.Field()
        .notBlank('process.ccdcSlice.panel.date.form.date.required')
        .date(DATE_FORMAT, 'process.ccdcSlice.panel.date.form.date.malformed')
}

const mapRecipeToProps = recipe => ({
    startDate: selectFrom(recipe, 'model.source.startDate'),
    endDate: selectFrom(recipe, 'model.source.endDate')
})

class Date extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.ccdcSlice.panel.date.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderContent()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {startDate, endDate, inputs: {date}} = this.props
        return (
            <Form.FieldSet
                layout='horizontal'
                errorMessage={[date]}>
                <Form.DatePicker
                    label={msg('process.ccdcSlice.panel.date.form.date.label')}
                    tooltip={msg('process.ccdcSlice.panel.date.form.date.tooltip')}
                    tooltipPlacement='top'
                    input={date}
                    startDate='1982-08-22'
                    endDate={moment()}
                />

                {startDate && endDate
                    ? <p className={styles.dateRange}>
                        {msg('process.ccdcSlice.panel.date.form.date.range', {startDate, endDate})}
                    </p>
                    : null}
            </Form.FieldSet>
        )
    }

    componentDidMount() {
        const {startDate, endDate, inputs: {date}} = this.props
        if (!date.value && startDate && endDate) {
            const middle = moment((
                moment(startDate, DATE_FORMAT).valueOf()
                + moment(endDate, DATE_FORMAT).valueOf()
            ) / 2).format(DATE_FORMAT)
            date.set(middle)
        }
    }
}

Date.propTypes = {}

export default compose(
    Date,
    recipeFormPanel({id: 'date', fields, mapRecipeToProps})
)
