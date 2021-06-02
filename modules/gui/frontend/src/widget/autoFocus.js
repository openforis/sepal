import PropTypes from 'prop-types'
import React from 'react'

export default class AutoFocus extends React.Component {
    state = {
        completed: false
    }

    render() {
        const {children} = this.props
        return children
    }

    componentDidMount() {
        const {enabled} = this.props
        if (enabled) {
            this.update()
        } else {
            this.completed()
        }
    }

    componentDidUpdate() {
        this.update()
    }

    update() {
        const {element, enabled} = this.props
        const {completed} = this.state

        if (enabled && !completed) {
            element && element.focus()
            if (document.activeElement === element) {
                this.completed()
            }
        }
    }

    completed() {
        this.setState({completed: true})
    }
}

AutoFocus.propTypes = {
    children: PropTypes.any,
    element: PropTypes.object,
    enabled: PropTypes.any
}

// import {compose} from 'compose'
// import Portal from 'widget/portal'
// import PropTypes from 'prop-types'
// import React from 'react'
// import withForwardedRef from 'ref'

// class AutoFocus extends React.Component {
//     focusHolderRef = React.createRef()
//     state = {completed: false}

//     render() {
//         const {completed} = this.state
//         console.log({completed})
//         return completed
//             ? null
//             : this.renderFocusHolder()
//     }

//     renderFocusHolder() {
//         return (
//             <Portal type='global'>
//                 <div ref={this.focusHolderRef} tabIndex={-1} style={{position: 'fixed'}}/>
//             </Portal>
//         )
//     }

//     // shouldComponentUpdate(nextProps) {
//     //     const {enabled} = nextProps
//     //     return !!enabled
//     // }

//     componentDidMount() {
//         const {enabled} = this.props
//         if (enabled) {
//             const focusHolderElement = this.focusHolderRef.current
//             focusHolderElement && focusHolderElement.focus()
//             this.update()
//         }
//     }

//     componentDidUpdate() {
//         this.update()
//     }

//     update() {
//         const {element, enabled} = this.props
//         const focusHolderElement = this.focusHolderRef.current

//         console.log({element, enabled, focusHolderElement})

//         if (!enabled || !element || !focusHolderElement) {
//             console.log('skip')
//             return
//         }

//         if (document.activeElement !== focusHolderElement) {
//             console.log('pre')
//             this.setState({completed: true})
//             return
//         }

//         element.focus()

//         if (document.activeElement === element) {
//             console.log('post')
//             this.setState({completed: true})
//         }
//     }
// }

// export default compose(
//     AutoFocus,
//     // withForwardedRef()
// )

// AutoFocus.propTypes = {
//     element: PropTypes.object,
//     enabled: PropTypes.any,
//     // forwardedRef: PropTypes.object
// }
