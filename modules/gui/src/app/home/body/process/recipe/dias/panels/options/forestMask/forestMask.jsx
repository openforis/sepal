import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Form} from '~/widget/form'

import {HansenSection} from './hansenSection'
import {SourceSection} from './sourceSection'

// The form fields choosing the options' forest mask (forestMaskModel.js).
export const forestMaskFields = {
    forestMaskType: new Form.Field()
        .notBlank(),
    forestMaskSourceType: new Form.Field()
        .skip((value, {forestMaskType}) => forestMaskType !== 'SOURCE')
        .notBlank(),
    forestMaskAsset: new Form.Field()
        .skip((value, {forestMaskType, forestMaskSourceType}) => !(forestMaskType === 'SOURCE' && forestMaskSourceType === 'ASSET'))
        .notBlank('process.dias.panel.options.form.forestMask.asset.required'),
    forestMaskRecipe: new Form.Field()
        .skip((value, {forestMaskType, forestMaskSourceType}) => !(forestMaskType === 'SOURCE' && forestMaskSourceType === 'RECIPE_REF'))
        .notBlank('process.dias.panel.options.form.forestMask.recipe.required'),
    forestMaskThreshold: new Form.Field()
        .skip((value, {forestMaskType}) => forestMaskType !== 'HANSEN')
        .notBlank('process.dias.panel.options.form.forestMask.threshold.required')
        .number()
        .min(0)
        .max(100)
}

export class ForestMask extends React.Component {
    render() {
        const {inputs: {forestMaskType}} = this.props
        return (
            <React.Fragment>
                <Form.Buttons
                    label={msg('process.dias.panel.options.form.forestMask.label')}
                    tooltip={msg('process.dias.panel.options.form.forestMask.tooltip')}
                    input={forestMaskType}
                    options={['NONE', 'HANSEN', 'SOURCE'].map(type => ({
                        value: type,
                        label: msg(['process.dias.panel.options.form.forestMask.type', type, 'label']),
                        tooltip: msg(['process.dias.panel.options.form.forestMask.type', type, 'tooltip'])
                    }))}
                />
                {this.renderSection()}
            </React.Fragment>
        )
    }

    componentDidUpdate(prevProps) {
        const {inputs: {forestMaskType, forestMaskAsset, forestMaskRecipe}} = this.props
        // Leaving Custom starts its image over, as switching an image's kind does (sourceSection.jsx).
        if (prevProps.inputs.forestMaskType.value === 'SOURCE' && forestMaskType.value !== 'SOURCE') {
            forestMaskAsset.set('')
            forestMaskRecipe.set('')
        }
    }

    renderSection() {
        const {inputs: {forestMaskType, forestMaskSourceType, forestMaskAsset, forestMaskRecipe, forestMaskThreshold}} = this.props
        switch (forestMaskType.value) {
            case 'HANSEN':
                return <HansenSection threshold={forestMaskThreshold}/>
            case 'SOURCE':
                return <SourceSection sourceType={forestMaskSourceType} asset={forestMaskAsset} recipe={forestMaskRecipe}/>
            default:
                return null
        }
    }
}

ForestMask.propTypes = {
    inputs: PropTypes.object.isRequired
}
