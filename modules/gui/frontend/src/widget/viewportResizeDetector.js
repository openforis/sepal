import {compose} from 'compose'
import {connect, select} from 'store'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = () => ({
    dimensions: select('dimensions') || []
})

class ViewportResizeDetector extends React.Component {
    componentDidUpdate() {
        const {dimensions, onChange} = this.props
        onChange && onChange(dimensions)
        
    }
    render() {
        return null
    }
}

ViewportResizeDetector.propTypes = {
    dimensions: PropTypes.object,
    onChange: PropTypes.func
}

export default compose(
    ViewportResizeDetector,
    connect(mapStateToProps)
)
