import React from 'react'

export default class Tasks extends React.Component {
    render() {
        return (
            <div style={{background: 'red'}}>
                <h1>Tasks</h1>
                <input id='browse' autoFocus={true}/>
            </div>
        )
    }
}