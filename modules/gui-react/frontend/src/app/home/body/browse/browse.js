import React from 'react'

export default class Browse extends React.Component {
    render() {
        return (
            <div style={{background: 'blue'}}>
                <h1>Browse</h1>
                <input id='browse' autoFocus={true}/>
            </div>
        )
    }
}