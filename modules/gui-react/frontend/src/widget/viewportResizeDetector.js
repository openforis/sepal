import React from 'react'
import {connect, select} from 'store'
import PropTypes from 'prop-types'

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

export default connect(mapStateToProps)(ViewportResizeDetector)
