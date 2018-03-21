import React from 'react'

export default class Account extends React.Component {
    componentWillMount() {
        console.log('Browse: componentWillMount')
    }

    componentWillUnmount() {
        console.log('Browse: componentWillUnmount')
    }

    render() {
        return (
            <div style={{background: 'purple'}}>
                <h1>Account</h1>
                <input id='browse' autoFocus={true}/>
            </div>
        )
    }
}