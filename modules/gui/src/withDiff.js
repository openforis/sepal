import React from 'react'
import diff from 'deep-diff'

export const withDiff = () =>
    WrappedComponent =>
        class HigherOrderComponent extends React.Component {
            render() {
                return React.createElement(WrappedComponent, this.props)
            }

            componentDidUpdate(prevProps) {
                console.log('diff:', diff(prevProps, this.props))
            }
        }
