import {Form} from '~/widget/form'
import {msg} from '~/translate'
import PropTypes from 'prop-types'
import React from 'react'

export class SectionSelection extends React.Component {
    render() {
        const {inputs: {section}} = this.props
        const options = [
            {
                value: 'RECIPE_REF',
                label: msg('process.ccdcSlice.panel.source.recipe.label')
            },
            {
                value: 'ASSET',
                label: msg('process.ccdcSlice.panel.source.asset.label')
            }
        ]
        return (
            <Form.Buttons
                look='transparent'
                shape='pill'
                layout='vertical'
                alignment='fill'
                air='more'
                input={section}
                options={options}/>
        )
    }
}

SectionSelection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired
}
