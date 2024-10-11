import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivators} from '~/widget/activation/activator'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'

import {Calculation} from './calculation'
import styles from './calculations.module.css'

const mapRecipeToProps = recipe => {
    return ({
        calculations: selectFrom(recipe, 'model.calculations.calculations'),
    })
}

class _Calculations extends React.Component {
    render() {
        return (
            <>
                <RecipeFormPanel
                    placement='bottom-right'
                    className={styles.panel}>
                    <Panel.Header
                        icon='calculator'
                        title={msg('process.bandMath.panel.calculations.title')}
                    />
                    <Panel.Content>
                        {this.renderContent()}
                    </Panel.Content>
                    <Form.PanelButtons>
                        <Panel.Buttons.Add onClick={() => this.addCalculation()}/>
                    </Form.PanelButtons>
                </RecipeFormPanel>
                <Calculation/>
            </>
        )
    }

    renderContent() {
        const {calculations = []} = this.props
        return calculations.length
            ? this.renderCalculations(calculations)
            : this.renderNoCalculationsMessage()
    }

    renderCalculations(calculations) {
        return (
            <Layout type='vertical' spacing='tight'>
                {calculations.map((calculation, index) => this.renderCalculation(calculation, index))}
            </Layout>
        )
    }

    renderCalculation(calculation, index) {
        const usedBandExpressions = calculation.usedBands.map(({imageName, name}) => `${imageName}.${name}`)
        const description = calculation.type === 'FUNCTION'
            ? (
                <>
                    <strong>{`${calculation.reducer}`}</strong>{`(${usedBandExpressions.join(', ')})`}
                </>
            )
            : calculation.expression
        const key = `${calculation.type}-${calculation.id}-${index}`
        return (
            <ListItem
                key={key}
                onClick={() => this.editCalculation(calculation)}>
                <CrudItem
                    title={msg(`process.bandMath.panel.calculations.form.type.${calculation.type}`)}
                    description={description}
                    metadata={calculation.name}
                    onRemove={() => this.removeCalculation(calculation)}
                />
            </ListItem>
        )
    }

    renderNoCalculationsMessage() {
        return (
            <NoData message={msg('process.bandMath.panel.calculations.form.noCalculations')}/>
        )
    }

    addCalculation() {
        const {activator: {activatables: {calculation}}} = this.props
        calculation.activate({imageId: uuid()})
    }

    editCalculation(calculationToEdit) {
        const {activator: {activatables: {calculation}}} = this.props
        calculation.activate({imageId: calculationToEdit.imageId})
    }

    removeCalculation(calculationToRemove) {
        const {recipeId} = this.props
        const actionBuilder = recipeActionBuilder(recipeId)
        actionBuilder('REMOVE_CALCULATION', {calculationToRemove})
            .del(['model.calculations.calculations', {id: calculationToRemove.id}])
            .del(['ui.calculations.calculations', {id: calculationToRemove.id}])
            .dispatch()
    }
}

const additionalPolicy = () => ({calculation: 'allow'})
// [HACK] This actually isn't a form, and we don't want to update the model. This prevents the selected images from
// being overridden.
const valuesToModel = null

export const Calculations = compose(
    _Calculations,
    recipeFormPanel({id: 'calculations', mapRecipeToProps, valuesToModel, additionalPolicy}),
    withActivators('calculation')
)

Calculations.propTypes = {
    recipeId: PropTypes.string,
    onChange: PropTypes.func,
}
