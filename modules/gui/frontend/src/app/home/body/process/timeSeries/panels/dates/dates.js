import {recipePath} from 'app/home/body/process/timeSeries/timeSeriesRecipe'
import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import DatePicker from 'widget/datePicker'
import {Constraint, ErrorMessage, Field, form, Label} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import {RecipeActions, RecipeState} from '../../timeSeriesRecipe'
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

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.dates')
    if (!values) {
        const model = recipeState('model.dates')
        values = modelToValues(model)
        RecipeActions(recipeId).setDates({values, model}).dispatch()
    }
    return {values}
}

class Dates extends React.Component {
    modal = React.createRef()

    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

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
        const {recipeId, form} = this.props
        return (
            <Panel className={styles.panel}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.timeSeries.panel.dates.title')}/>

                <PanelContent>
                    <div ref={this.modal} className={styles.form}>
                        {this.renderContent()}
                    </div>
                </PanelContent>

                <PanelButtons
                    form={form}
                    statePath={recipePath(recipeId, 'ui')}
                    onApply={values => this.recipeActions.setDates({values, model: valuesToModel(values)}).dispatch()}
                />
            </Panel>
        )
    }
}

Dates.propTypes = {
    recipeId: PropTypes.string
}

export default form({fields, constraints, mapStateToProps})(Dates)

const valuesToModel = values => {
    return {...values}
}

const modelToValues = (model = {}) => {
    return {...model}
}
