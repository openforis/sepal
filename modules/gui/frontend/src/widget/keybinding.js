import {filter, map} from 'rxjs/operators'
import {fromEvent} from 'rxjs'
import {v4 as uuid} from 'uuid'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const instances = []

const keypress$ = fromEvent(document, 'keydown').pipe(
    map(event => {
        const [instance] = instances
        return {event, instance}
    })
)

export default class Keybinding extends React.Component {
    id = uuid()
    subscriptions = []

    render() {
        const {children} = this.props
        return children
    }

    keyHandler(event) {
        const {keymap} = this.props
        const {key} = event
        const handler = keymap[key]
        if (handler) {
            handler(event)
        } else if (keymap.default) {
            keymap.default(event)
        }
    }

    pushInstance() {
        instances.unshift(this.id)
    }

    popInstance() {
        const index = instances.indexOf(this.id)
        if (index !== -1) {
            instances.splice(index, 1)
        }
    }

    componentDidMount() {
        this.pushInstance()
        const relevantKeypresses$ = keypress$.pipe(
            filter(({instance}) => instance === this.id),
            map(({event}) => event)
        )
        this.subscriptions.push(
            relevantKeypresses$.subscribe(
                event => this.keyHandler(event)
            )
        )
    }

    componentWillUnmount() {
        this.popInstance()
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }
}

Keybinding.propTypes = {
    map: PropTypes.object
}

// const keypress$ = fromEvent(document, 'keydown')

// export default class Keybinding extends React.Component {
//     id = uuid()
//     subscriptions = []
//     static instances = []

//     render() {
//         const {children} = this.props
//         return children
//     }

//     handleEscape() {
//         const blurrableElements = ['INPUT', 'SELECT']
//         if (blurrableElements.includes(document.activeElement.tagName)) {
//             document.activeElement.blur()
//         } else {
//             const {onEscape} = this.props
//             onEscape && onEscape()
//         }
//     }

//     handleEnter() {
//         const {onEnter} = this.props
//         onEnter && onEnter()
//     }

//     keyHandler(key) {
//         switch (key) {
//         case 'Escape':
//             return this.handleEscape()
//         case 'Enter':
//             return this.handleEnter()
//         default:
//         }
//     }

//     pushInstance() {
//         Keybinding.instances.push(this.id)
//     }

//     popInstance() {
//         Keybinding.instances = _.pull(Keybinding.instances, this.id)
//     }

//     isActiveInstance() {
//         return _.last(Keybinding.instances) === this.id
//     }

//     componentDidMount() {
//         this.pushInstance()
//         const relevantKeypresses$ = keypress$.pipe(
//             filter(() => _.last(Keybinding.instances) === this.id)
//         )
//         this.subscriptions.push(
//             relevantKeypresses$.subscribe(
//                 event => this.keyHandler(event.key)
//             )
//         )
//     }

//     componentWillUnmount() {
//         this.popInstance()
//         this.subscriptions.forEach(subscription => subscription.unsubscribe())
//     }
// }

// Keybinding.propTypes = {
//     onEnter: PropTypes.func,
//     onEscape: PropTypes.func
// }
