import {diff} from 'deep-diff'
import React from 'react'

export const withDiff = () =>
    WrappedComponent =>
        class WithDiffHOC extends React.Component {
            render() {
                return React.createElement(WrappedComponent, this.props)
            }

            componentDidUpdate(prevProps) {
                console.log('diff:', diff(prevProps, this.props))
            }
        }
