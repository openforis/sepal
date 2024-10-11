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
    imageId: new Form.Field(),
    section: new Form.Field()
        .notBlank(),
    name: new Form.Field()
        .notBlank()
        .match(/^[a-zA-Z_][a-zA-Z0-9_]{0,29}$/, 'process.bandMath.panel.bandNames.invalidFormat')
        .predicate(
            (name, {otherNames}) => !otherNames.includes(name),
            'process.bandMath.duplicateName'
        ),
    reducer: new Form.Field()
        .skip((value, {section}) => section !== 'FUNCTION')
        .notBlank(),
    expression: new Form.Field()
        .skip((value, {section}) => section !== 'EXPRESSION')
        .notBlank(),
    bandName: new Form.Field()
        .notBlank(),
    usedBands: new Form.Field()
        .skip((value, {section}) => section !== 'FUNCTION') // TODO: Actually always needed
        .notEmpty(),
    usedBandIds: new Form.Field()
        .skip((value, {section}) => section !== 'FUNCTION') // TODO: Actually always needed
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
                    shared={['imageId', 'name', 'otherNames']}
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

    setCalculationId() {
        const {inputs, activatable: {imageId}} = this.props
        if (!inputs.imageId.value) {
            inputs.imageId.set(imageId)
        }
    }

    setName() {
        const {calculations, inputs: {name}} = this.props
        if (!name.value) {
            name.set(`c${calculations.length + 1}`)
        }
    }

    setOtherNames() {
        const {images, calculations, inputs: {otherNames}, activatable: {imageId}} = this.props
        if (!otherNames.value) {
            const imageNames = images
                .map(({name}) => name)
            const otherCalculationNames = calculations
                .filter(calculation => calculation.imageId !== imageId)
                .map(({name}) => name)
            otherNames.set([...imageNames, ...otherCalculationNames])
        }
    }
}

console.log('TODO: bandName/includedBands - update for FUNCTION ')

const modelToValues = model => {
    const values = {
        imageId: model.imageId,
        name: model.name,
        section: model.type || 'SELECTION',
        usedBands: model.usedBands,
        usedBandIds: model.usedBands.map(({id}) => id),
        reducer: model.reducer,
        expression: model.expression,
        bandName: model.includedBands?.length && model.includedBands[0].name
    }
    return values
}

const valuesToModel = values => {
    const model = {
        imageId: values.imageId,
        name: values.name,
        type: values.section,
        usedBands: values.usedBands,
        reducer: values.reducer,
        expression: values.expression,
        includedBands: [{
            id: values.imageId,
            name: values.bandName,
            type: 'continuous'
        }]
    }
    return model
}

const policy = () => ({_: 'allow'})
const panelOptions = {
    id: 'calculation',
    path: props => {
        const imageId = selectFrom(props, 'activatable.imageId')
        return imageId ? ['calculations.calculations', {imageId}] : null
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
