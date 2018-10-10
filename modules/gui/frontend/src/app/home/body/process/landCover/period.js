import {Constraint, ErrorMessage, Field, Label, form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState, recipePath} from './landCoverRecipe'
import {msg} from 'translate'
import DatePicker from 'widget/datePicker'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import moment from 'moment'
import styles from './period.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const fields = {
    startYear: new Field()
        .int('process.landCover.panel.period.startYear.malformed'),

    endYear: new Field()
        .int('process.landCover.panel.period.endYear.malformed'),
}

const constraints = {
    startBeforeEnd: new Constraint(['startYear', 'endYear'])
        .predicate(({startYear, endYear}) => {
            return +startYear < +endYear
        }, 'process.landCover.panel.period.startBeforeEnd')
}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.period')
    if (!values) {
        const model = recipeState('model.period')
        values = modelToValues(model)
        RecipeActions(recipeId).setPeriod({values, model}).dispatch()
    }
    return {values}
}

class Period extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {recipeId, form} = this.props
        return (
            <Panel className={styles.panel}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.landCover.panel.period.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons
                    statePath={recipePath(recipeId, 'ui')}
                    form={form}
                    onApply={values => this.recipeActions.setPeriod({
                        values,
                        model: valuesToModel(values)
                    }).dispatch()}/>
            </Panel>
        )
    }

    renderContent() {
        const {inputs: {startYear, endYear}} = this.props
        return (
            <div className={styles.content}>
                <div className={styles.startYearLabel}>
                    <Label msg={msg('process.landCover.panel.period.startYear.label')}/>
                </div>
                <div className={styles.startYear}>
                    <DatePicker
                        input={startYear}
                        startDate={moment('1982-01-01', DATE_FORMAT)}
                        endDate={moment()}
                        resolution='year'/>
                    <ErrorMessage for={startYear}/>
                </div>
                <div className={styles.endYearLabel}>
                    <Label msg={msg('process.landCover.panel.period.endYear.label')}/>
                </div>
                <div className={styles.endYear}>
                    <DatePicker
                        input={endYear}
                        startDate={moment('1983-01-01', DATE_FORMAT)}
                        endDate={moment()}
                        resolution='year'/>
                    <ErrorMessage for={endYear}/>
                </div>
                <div className={styles.error}>
                    <ErrorMessage for={[startYear, endYear, 'startBeforeEnd']}/>
                </div>
            </div>
        )
    }
}

Period.propTypes = {
    recipeId: PropTypes.string,
}

export default form({fields, constraints, mapStateToProps})(Period)

const valuesToModel = values => ({
    startYear: +values.startYear,
    endYear: +values.endYear,
})

const modelToValues = (model = {}) => ({
    startYear: String(model.startYear || ''),
    endYear: String(model.endYear || ''),
})
