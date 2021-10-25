import * as PropTypes from 'prop-types'
import {compose} from 'compose'
import {withScrollable} from 'widget/scrollable'
import React, {Component} from 'react'

class ImageForm extends Component {
    render() {
        return null
    }

}

ImageForm.propTypes = {
    children: PropTypes.any,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any
}

export default compose(
    ImageForm,
    withScrollable()
)
