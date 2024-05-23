import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Form} from '~/widget/form'

export class SectionSelection extends React.Component {
    render() {
        const {section} = this.props

        const options = [
            {
                value: 'CSV_UPLOAD',
                label: msg('process.classification.panel.trainingData.type.CSV_UPLOAD.label'),
                tooltip: msg('process.classification.panel.trainingData.type.CSV_UPLOAD.tooltip'),
            },
            {
                value: 'EE_TABLE',
                label: msg('process.classification.panel.trainingData.type.EE_TABLE.label'),
                tooltip: msg('process.classification.panel.trainingData.type.EE_TABLE.tooltip'),
            },
            {
                value: 'SAMPLE_CLASSIFICATION',
                label: msg('process.classification.panel.trainingData.type.SAMPLE_CLASSIFICATION.label'),
                tooltip: msg('process.classification.panel.trainingData.type.SAMPLE_CLASSIFICATION.tooltip'),
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
