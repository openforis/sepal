import React from 'react'

export default class Users extends React.Component {
    componentWillMount() {
        console.log('Browse: componentWillMount')
    }

    componentWillUnmount() {
        console.log('Browse: componentWillUnmount')
    }

    render() {
        return (
            <div style={{background: 'green'}}>
                <h1>Users</h1>
                <input id='browse' autoFocus={true}/>
            </div>
        )
    }
}