import React from 'react'

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
        }
        if (!this.props.active && nextProps.active) {
            this.className = this.props.classNames.in
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