import PropTypes from 'prop-types'
import React from 'react'

import {DEFAULT_FOREST_THRESHOLD} from '~/app/home/body/process/recipe/dias/diasRecipe'
import {msg} from '~/translate'
import {Form} from '~/widget/form'

export class HansenSection extends React.Component {
    render() {
        const {threshold} = this.props
        return (
            <Form.Slider
                label={msg('process.dias.panel.options.form.forestMask.threshold.label')}
                tooltip={msg('process.dias.panel.options.form.forestMask.threshold.tooltip')}
                input={threshold}
                minValue={0}
                maxValue={100}
                ticks={[0, 10, 25, 50, 75, 90, 100]}
                info={value => msg('process.dias.panel.options.form.forestMask.threshold.value', {value})}
            />
        )
    }

    componentDidMount() {
        this.initialize()
    }

    componentDidUpdate() {
        this.initialize()
    }

    // The slider shows a value it never writes until moved, so a blank threshold starts at the default instead.
    initialize() {
        const {threshold} = this.props
        if ([undefined, null, ''].includes(threshold.value)) {
            threshold.setInitialValue(DEFAULT_FOREST_THRESHOLD)
        }
    }
}

HansenSection.propTypes = {
    threshold: PropTypes.object.isRequired
}
