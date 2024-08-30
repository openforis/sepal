import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Form} from '~/widget/form'

export class SectionSelection extends React.Component {
    render() {
        const {section} = this.props

        const options = [
            {
                value: 'EE_TABLE',
                label: msg('process.classification.panel.trainingData.type.EE_TABLE.label'),
                tooltip: msg('process.classification.panel.trainingData.type.EE_TABLE.tooltip'),
            },
            {
                value: 'SAMPLE_IMAGE',
                label: msg('process.regression.panel.trainingData.type.SAMPLE_IMAGE.label'),
                tooltip: msg('process.regression.panel.trainingData.type.SAMPLE_IMAGE.tooltip'),
            },
            {
                value: 'RECIPE',
                label: msg('process.classification.panel.trainingData.type.RECIPE.label'),
                tooltip: msg('process.classification.panel.trainingData.type.RECIPE.tooltip'),
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
    section: PropTypes.object.isRequired
}
