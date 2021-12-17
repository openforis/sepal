import {ElementResizeDetector} from 'widget/elementResizeDetector'
import React from 'react'
import actionBuilder from 'action-builder'

export default class ViewportResizeSensor extends React.Component {
    render() {
        return (
            <ElementResizeDetector
                debounce={100}
                onResize={size => this.updateDimensions(size)}
            />
        )
    }

    updateDimensions({width, height}) {
        actionBuilder('SET_APP_DIMENSIONS')
            .set('dimensions', {width, height})
            .dispatch()
    }
}

ViewportResizeSensor.propTypes = {}
