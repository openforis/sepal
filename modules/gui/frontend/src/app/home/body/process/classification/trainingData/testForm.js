import * as PropTypes from 'prop-types'
import {Layout} from 'widget/layout'
import {compose} from 'compose'
import React, {Component} from 'react'

class TestForm extends Component {
    render() {
        return (
            <Layout>
                <div>Test form</div>
            </Layout>
        )
    }
}

TestForm.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.any
}

export default compose(
    TestForm
)
