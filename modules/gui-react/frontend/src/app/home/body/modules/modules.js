import React from 'react'

export default class Modules extends React.Component {
    componentWillMount() {
        console.log('Browse: componentWillMount')
    }

    componentWillUnmount() {
        console.log('Browse: componentWillUnmount')
    }

    render() {
        return (
            <div style={{background: 'orange'}}>
                <h1>Modules</h1>
                <input id='browse' autoFocus={true}/>
            </div>
        )
    }
}