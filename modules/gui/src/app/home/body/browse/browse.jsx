import React from 'react'

import {msg} from '~/translate'
import {Tabs} from '~/widget/tabs/tabs'

import {AssetBrowser} from './assets/assetBrowser'
import {FileBrowser} from './files/fileBrowser'

const FILE_BROWSER = 'FILE_BROWSER'
const ASSET_BROWSER = 'ASSET_BROWSER'

export class Browse extends React.Component {
    constructor(props) {
        super(props)
        this.renderTab = this.renderTab.bind(this)
    }

    render() {
        const options = [{
            label: msg('browse.addBrowser.files'),
            value: FILE_BROWSER,
        }, {
            label: msg('browse.addBrowser.assets'),
            value: ASSET_BROWSER,
        }]
            
        return (
            <Tabs
                label={msg('home.sections.browse')}
                statePath='terminal'
                defaultType={FILE_BROWSER}
                addTabOptions={options}>
                {this.renderTab}
            </Tabs>
        )
    }

    renderTab({id, type}) {
        switch (type) {
        case FILE_BROWSER:
            return <FileBrowser id={id}/>
        case ASSET_BROWSER:
            return <AssetBrowser id={id}/>
        default:
            return null
        }
    }
}
