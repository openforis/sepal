import React from 'react'
import actionBuilder from 'store'

export default class Selectable extends React.Component {
    constructor(props) {
        super(props)
        if (this.props.active) {
            this.className = props.classNames.in
        }
    }

    componentWillReceiveProps(nextProps) {
        if (this.props.active && !nextProps.active) {
            this.className = this.props.classNames.out
            this.active = false
            // this.activeElement = document.activeElement
            console.log('capture focus', this.activeElement && this.activeElement.id)
        }
        if (!this.props.active && nextProps.active) {
            this.className = this.props.classNames.in
            // this.activeElement && this.activeElement.focus()
            console.log('set focus', this.activeElement && this.activeElement.id)
        }
    }

    render () {
        return (
            <div className={[this.props.classNames.default, this.className].join(' ')}>
                {this.props.children}
            </div>
        )
    }
}