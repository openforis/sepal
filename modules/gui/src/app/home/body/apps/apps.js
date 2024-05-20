import React from 'react'

import {msg} from '~/translate'
import {Tabs} from '~/widget/tabs/tabs'

import {App} from './app'

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
