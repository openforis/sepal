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
        const {children} = this.props
        return children
    }
}

ViewportResizeDetector.propTypes = {
    children: PropTypes.any,
    dimensions: PropTypes.object,
    onChange: PropTypes.func
}

export default compose(
    ViewportResizeDetector,
    connect(mapStateToProps)
)
