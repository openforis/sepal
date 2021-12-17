import {Tabs} from 'widget/tabs/tabs'
import {msg} from 'translate'
import App from './app'
import React from 'react'

export default class Apps extends React.Component {
    render() {
        return (
            <Tabs
                label={msg('home.sections.app-launch-pad')}
                statePath='apps'
                isLandingTab={({path}) => !path}>
                {({id}) => <App id={id}/>}
            </Tabs>
        )
    }
}
