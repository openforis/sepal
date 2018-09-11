import React from 'react'

export default class Account extends React.Component {
    render() {
        return (
            <div style={{background: 'purple'}}>
                <h1>Account</h1>
                <input id='browse' autoFocus={true}/>
            </div>
        )
    }
}
