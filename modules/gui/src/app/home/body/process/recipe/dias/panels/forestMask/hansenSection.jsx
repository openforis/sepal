import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'

class _HansenSection extends React.Component {
    render() {
        const {inputs: {threshold}} = this.props
        return (
            <Layout>
                <Form.Slider
                    label={msg('process.dias.panel.forestMask.form.threshold.label')}
                    tooltip={msg('process.dias.panel.forestMask.form.threshold.tooltip')}
                    input={threshold}
                    minValue={0}
                    maxValue={100}
                    ticks={[0, 10, 25, 50, 75, 90, 100]}
                    info={value => msg('process.dias.panel.forestMask.form.threshold.value', {value})}
                />
            </Layout>
        )
    }
}

export const HansenSection = _HansenSection

HansenSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
