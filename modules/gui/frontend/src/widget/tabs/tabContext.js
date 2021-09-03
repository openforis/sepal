import {withContext} from 'context'
import React from 'react'

export const TabContext = React.createContext()

export const withTabContext = () =>
    WrappedComponent =>
        withContext(TabContext, 'tabContext')()(
            class _HigherOrderComponent extends React.Component {
                constructor(props) {
                    super(props)
                    const {tabContext: {getBusy$}} = props
                    this.busy$ = getBusy$()
                }

                render() {
                    const props = {
                        ...this.props,
                        busy$: this.busy$
                    }
                    return React.createElement(WrappedComponent, props)
                }

                componentWillUnmount() {
                    this.busy$.complete()
                }
            }
        )
