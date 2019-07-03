import PropTypes from 'prop-types'
import React from 'react'
import ViewportResizeDetector from 'widget/viewportResizeDetector'
import styles from './autofit.module.css'

export class Autofit extends React.Component {
    parent = React.createRef()
    element = React.createRef()

    state = {
        scale: 1
    }
    
    render() {
        const {className, children} = this.props
        const {scale} = this.state
        return (
            <ViewportResizeDetector onChange={() => this.setScale()}>
                <div ref={this.parent} className={className}>
                    <div ref={this.element} className={styles.autofit} style={{transform: `scale(${scale})`}}>
                        {children}
                    </div>
                </div>
            </ViewportResizeDetector>
        )
    }

    componentDidMount() {
        this.setScale()
    }

    setScale() {
        const {scale} = this.state
        const element = this.element.current
        const parent = this.parent.current
        if (parent && element) {
            const horizontalScale = parent.clientWidth / element.clientWidth
            const verticalScale = parent.clientHeight / element.clientHeight
            const nextScale = Math.min(horizontalScale, verticalScale)
            if (scale !== nextScale) {
                this.setState({scale: nextScale})
            }
        }
    }
}

Autofit.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}
