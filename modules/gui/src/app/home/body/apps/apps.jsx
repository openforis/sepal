import React from 'react'

import api from '~/apiRegistry'
import {getLogger} from '~/log'
import {msg} from '~/translate'
import {Tabs} from '~/widget/tabs/tabs'

import {App} from './app'

const log = getLogger('apps')

export class Apps extends React.Component {
    constructor(props) {
        super(props)
        this.renderApp = this.renderApp.bind(this)
        this.isLandingTab = this.isLandingTab.bind(this)
        this.onCloseTab = this.onCloseTab.bind(this)
    }

    render() {
        return (
            <Tabs
                label={msg('home.sections.app-launch-pad')}
                statePath='apps'
                isLandingTab={this.isLandingTab}
                newTabPlaceholder={msg('apps.landingTab')}
                readOnlyTitles
                onClose={this.onCloseTab}>
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

    onCloseTab({path, sessionId}, close) {
        if (path && sessionId) {
            // Unbind the app from its instance so it can be re-opened on a different one
            // (or a second copy started elsewhere). Fire-and-forget: closing the tab must
            // not wait on — or fail with — the release request.
            api.apps.releaseSession$(path).subscribe({
                error: error => log.warn(`Failed to release app session for ${path}`, error)
            })
        }
        close()
    }
}
