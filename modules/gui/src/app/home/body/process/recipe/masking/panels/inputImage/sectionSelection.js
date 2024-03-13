import {Form} from '~/widget/form'
import {msg} from '~/translate'
import PropTypes from 'prop-types'
import React from 'react'

export class SectionSelection extends React.Component {
    render() {
        const {section} = this.props
        const options = [
            {
                value: 'RECIPE_REF',
                label: msg('process.masking.panel.inputImage.recipe.title')
            },
            {
                value: 'ASSET',
                label: msg('process.masking.panel.inputImage.asset.title')
            },
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
    section: PropTypes.object.isRequired
}
