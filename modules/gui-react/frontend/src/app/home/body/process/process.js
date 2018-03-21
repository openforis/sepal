import React from 'react'

export default class Process extends React.Component {
    componentWillMount() {
        console.log('Browse: componentWillMount')
    }

    componentWillUnmount() {
        console.log('Browse: componentWillUnmount')
    }

    render() {
        return (
            <div style={{background: 'brown'}}>
                <h1>Process</h1>
                <input id='browse' autoFocus={true}/>
            </div>
        )
    }
}