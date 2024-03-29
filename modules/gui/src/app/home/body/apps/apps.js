import {App} from './app'
import {Tabs} from '~/widget/tabs/tabs'
import {msg} from '~/translate'
import React from 'react'

export class Apps extends React.Component {
    constructor() {
        super()
        this.renderApp = this.renderApp.bind(this)
        this.isLandingTab = this.isLandingTab.bind(this)
    }

    render() {
        return (
            <Tabs
                label={msg('home.sections.app-launch-pad')}
                statePath='apps'
                isLandingTab={this.isLandingTab}>
                {this.renderApp}
            </Tabs>
        )
    }

    renderApp({id}) {
        return (
            <App id={id}/>
        )
    }

    isLandingTab({path}) {
        return !path
    }
}
