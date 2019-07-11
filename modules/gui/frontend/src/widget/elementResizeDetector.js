import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'

export class ElementResizeDetector extends React.Component {
    render() {
        const {debounceTime, onResize, children} = this.props
        return (
            <ReactResizeDetector
                handleHeight
                handleWidth
                refreshMode='debounce'
                refreshRate={debounceTime}
                onResize={(width, height) => onResize({width, height})}>
                {children || null}
            </ReactResizeDetector>
        )
    }
}

ElementResizeDetector.propTypes = {
    onResize: PropTypes.func.isRequired,
    children: PropTypes.any,
    debounceTime: PropTypes.number
}

ElementResizeDetector.defaultProps = {
    debounceTime: 250
}
