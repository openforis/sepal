import React from 'react'

export default class Users extends React.Component {
    render() {
        return (
            <div style={{background: 'green'}}>
                <h1>Users</h1>
                <input id='browse' autoFocus={true}/>
            </div>
        )
    }
}
