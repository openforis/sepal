import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'

export const withLeaveAlert = mapStateToLeaveAlert =>
    WrappedComponent => {
        const mapStateToProps = state => ({
            leaveAlert: mapStateToLeaveAlert(state)
        })

        return compose(
            class WithLeaveAlertHOC extends React.Component {
                constructor() {
                    super()
                    this.onClose = this.onClose.bind(this)
                }
            
                render() {
                    return React.createElement(WrappedComponent, this.props)
                }
    
                componentDidMount() {
                    window.addEventListener('beforeunload', this.onClose)
                }
            
                componentWillUnmount() {
                    window.removeEventListener('beforeunload', this.onClose)
                }
            
                onClose(e) {
                    const {leaveAlert} = this.props
                    if (leaveAlert) {
                        e.preventDefault()
                        e.returnValue = ''
                        return ''
                    }
                }
            },
            connect(mapStateToProps)
        )
    }
