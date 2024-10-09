import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {PanelSections} from '~/widget/panelSections'

import styles from './calculation.module.css'
import {ExpressionSection} from './expressionSection'
import {FunctionSection} from './functionSection'
import {SectionSelection} from './sectionSelection'

const fields = {
    otherNames: new Form.Field(),
    calculationId: new Form.Field(),
    section: new Form.Field()
        .notBlank(),
    name: new Form.Field()
        .notBlank()
        .match(/^[a-zA-Z_][a-zA-Z0-9_]{0,29}$/, 'process.bandMath.panel.bandNames.invalidFormat'),
    reducer: new Form.Field()
        .notBlank(),
    bandName: new Form.Field()
        .notBlank(),
    bands: new Form.Field()
        .notEmpty(),
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    images: selectFrom(recipe, 'model.inputImagery.images'),
    calculations: selectFrom(recipe, 'model.calculations.calculations') || [],
})

class _Calculation extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        const {inputs} = this.props
        const sections = [
            {
                component: <SectionSelection section={inputs.section}/>
            },
            {
                value: 'FUNCTION',
                label: msg('process.bandMath.panel.calculations.function.title'),
                title: msg('process.bandMath.panel.calculations.function.title'),
                component: <FunctionSection inputs={inputs}/>
            },
            {
                value: 'EXPRESSION',
                label: msg('process.bandMath.panel.calculations.expression.title'),
                title: msg('process.bandMath.panel.calculations.expression.title'),
                component: <ExpressionSection inputs={inputs}/>
            }
        ]

        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'>
                <PanelSections
                    inputs={inputs}
                    sections={sections}
                    selected={inputs.section}
                    icon='calculator'
                    label={msg('process.bandMath.panel.calculations.sections.title')}
                    defaultButtons={<Form.PanelButtons/>}
                />
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        this.setName()
        this.setOtherNames()
        this.setCalculationId()
    }

    componentDidUpdate() {
        this.setName()
        this.setOtherNames()
        this.setCalculationId()
    }

    setCalculationId() {
        const {inputs, activatable: {calculationId}} = this.props
        if (!inputs.calculationId.value) {
            inputs.calculationId.set(calculationId)
        }
    }

    setName() {
        const {images, inputs: {name}} = this.props
        if (!name.value) {
            name.set(`c${images.length}`)
        }
    }

    setOtherNames() {
        const {images, calculations, inputs: {otherNames}, activatable: {calculationId}} = this.props
        if (!otherNames.value) {
            const imageNames = images
                .map(({name}) => name)
            const otherCalculationNames = calculations
                .filter(calculation => calculation.calculationId !== calculationId)
                .map(({name}) => name)
            otherNames.set([...imageNames, ...otherCalculationNames])
        }
    }
}

const modelToValues = model => {
    return {
        calculationId: model.calculationId,
        name: model.name,
        section: model.type || 'SELECTION',
        bands: model.bands,
        reducer: model.reducer,
        bandName: model.bandName
    }
}

const valuesToModel = values => {
    return {
        calculationId: values.calculationId,
        name: values.name,
        type: values.section,
        bands: values.bands,
        reducer: values.reducer,
        bandName: values.bandName
    }
}

const policy = () => ({_: 'allow'})
const panelOptions = {
    id: 'calculation',
    path: props => {
        const calculationId = selectFrom(props, 'activatable.calculationId')
        return calculationId ? ['calculations.calculations', {calculationId}] : null
    },
    fields,
    valuesToModel,
    modelToValues,
    mapRecipeToProps,
    policy
}

export const Calculation = compose(
    _Calculation,
    recipeFormPanel(panelOptions)
)

Calculation.propTypes = {
    onChange: PropTypes.func
}
