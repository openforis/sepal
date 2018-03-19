import React from 'react'

export default class Terminal extends React.Component {
    componentWillMount() {
        console.log('Terminal: componentWillMount')
    }

    componentWillUnmount() {
        console.log('Terminal: componentWillUnmount')
    }

    render() {
        return <div>Terminal</div>
    }
}