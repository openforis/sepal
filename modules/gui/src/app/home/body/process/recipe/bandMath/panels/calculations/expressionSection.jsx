import PropTypes from 'prop-types'
import React from 'react'

import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'

import styles from './calculation.module.css'

export class ExpressionSection extends React.Component {

    render() {
        return (
            <Layout type={'vertical'}>
                {this.renderName()}
                {/* {this.renderImageSelector()}
                {this.renderIncludedBands()} */}
            </Layout>
        )
    }
    
    renderName() {
        const {inputs: {name}} = this.props
        // TODO: Use msg()
        // TODO: default
        // TODO: placeholder
        // TODO: tooltip
        // TODO: uniqueness
        // TODO: make input short, to hint that it's a good idea to keep the name short
        return (
            <Form.Input
                className={styles.name}
                label={'Calculation name'}
                tooltip={'The name of this calculation to use when referring to it within expressions.'}
                input={name}
                // placeholder={`${originalName}...`}
                autoComplete={false}
            />
        )
    }

}

ExpressionSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
