import React from 'react'

export default class Tasks extends React.Component {
    componentWillMount() {
        console.log('Browse: componentWillMount')
    }

    componentWillUnmount() {
        console.log('Browse: componentWillUnmount')
    }

    render() {
        return (
            <div style={{background: 'red'}}>
                <h1>Tasks</h1>
                <input id='browse' autoFocus={true}/>
            </div>
        )
    }
}