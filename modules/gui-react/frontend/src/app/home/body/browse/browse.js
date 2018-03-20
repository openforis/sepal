import React from 'react'

export default class Browse extends React.Component {
    componentWillMount() {
        console.log('Browse: componentWillMount')
    }

    componentWillUnmount() {
        console.log('Browse: componentWillUnmount')
    }

    render() {
        return (
            <div style={{background: 'blue'}}>
                <h1>Browse</h1>
                <input id='browse' autoFocus={true}/>
            </div>
        )
    }
}