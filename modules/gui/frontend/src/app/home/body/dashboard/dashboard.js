import React from 'react'
import {isMobile} from 'widget/userAgent'

export default class Dashboard extends React.Component {
    render() {
        return (
            <div style={{background: 'green'}}>
                <h1>Dashboard</h1>
                <input id='dash' autoFocus={!isMobile()}/>
            </div>
        )
    }
}
