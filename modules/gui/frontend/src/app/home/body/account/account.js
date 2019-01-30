import React from 'react'
import {isMobile} from 'widget/userAgent'

export default class Account extends React.Component {
    render() {
        return (
            <div style={{background: 'purple'}}>
                <h1>Account</h1>
                <input id='browse' autoFocus={!isMobile()}/>
            </div>
        )
    }
}
