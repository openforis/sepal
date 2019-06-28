import {Form} from 'widget/form/form'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'

export default class SectionSelection extends React.Component {
    render() {
        const {section} = this.props
        const options = [
            {
                value: 'RECIPE_REF',
                label: msg('process.classification.panel.inputImagery.recipe.title')
            },
            {
                value: 'ASSET',
                label: msg('process.classification.panel.inputImagery.asset.title')
            },
        ]
        return (
            <Form.Buttons
                look='transparent'
                shape='pill'
                type='vertical'
                air='more'
                input={section}
                options={options}/>
        )
    }
}

SectionSelection.propTypes = {
    section: PropTypes.object.isRequired
}
