import {initValues, withRecipePath} from 'app/home/body/process/recipe'
import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
// import {activatable} from 'widget/activation'
import DatePicker from 'widget/datePicker'
import {Constraint, ErrorMessage, Field, form} from 'widget/form'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import Label from 'widget/label'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from '../landCoverRecipe'
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

class Period extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {recipePath, form} = this.props

        const dirtyPolicy = {compatibleWith: {include: []}}
        const cleanPolicy = {deactivateWhen: {exclude: []}}
        const policy = () => form.isDirty() ? dirtyPolicy : cleanPolicy

        return (
            <FormPanel
                id='period'
                policy={policy}
                className={styles.panel}
                form={form}
                placement='bottom-right'
                statePath={recipePath + '.ui'}
                onApply={values => this.recipeActions.setPeriod({
                    values,
                    model: valuesToModel(values)
                }).dispatch()}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.landCover.panel.period.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <FormPanelButtons/>
            </FormPanel>
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
                        resolution='year'
                        errorMessage
                    />
                </div>
                <div className={styles.endYearLabel}>
                    <Label msg={msg('process.landCover.panel.period.endYear.label')}/>
                </div>
                <div className={styles.endYear}>
                    <DatePicker
                        input={endYear}
                        startDate={moment('1983-01-01', DATE_FORMAT)}
                        endDate={moment()}
                        resolution='year'
                        errorMessage
                    />
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

const valuesToModel = values => ({
    startYear: +values.startYear,
    endYear: +values.endYear,
})

const modelToValues = (model = {}) => ({
    startYear: String(model.startYear || ''),
    endYear: String(model.endYear || ''),
})

export default withRecipePath()(
    initValues({
        getModel: props => RecipeState(props.recipeId)('model.period'),
        getValues: props => RecipeState(props.recipeId)('ui.period'),
        modelToValues,
        onInitialized: ({model, values, props}) =>
            RecipeActions(props.recipeId)
                .setPeriod({values, model})
                .dispatch()
    })(
        form({fields, constraints})(
            // coordinateActivation('period', policy)(
                Period
            // )
        )
    )
)
