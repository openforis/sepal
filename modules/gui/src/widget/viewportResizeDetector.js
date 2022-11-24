import {compose} from 'compose'
import {connect, select} from 'store'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = () => ({
    dimensions: select('dimensions') || []
})

class _ViewportResizeDetector extends React.Component {
    componentDidUpdate() {
        const {dimensions, onChange} = this.props
        onChange && onChange(dimensions)

    }
    render() {
        const {children} = this.props
        return children || null
    }
}

export const ViewportResizeDetector = compose(
    _ViewportResizeDetector,
    connect(mapStateToProps)
)

ViewportResizeDetector.propTypes = {
    children: PropTypes.any,
    dimensions: PropTypes.object,
    onChange: PropTypes.func
}

export const withViewportDimensions = () =>
    WrappedComponent => {
        class WithViewportDimensionsHOC extends React.Component {
            render() {
                return React.createElement(WrappedComponent, this.props)
            }
        }

        return compose(
            WithViewportDimensionsHOC,
            connect(mapStateToProps)
        )
    }
