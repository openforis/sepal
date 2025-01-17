import React from 'react'

import {msg} from '~/translate'
import {Tabs} from '~/widget/tabs/tabs'

import {FileBrowser} from './files/fileBrowser'

export class Browse extends React.Component {
    render() {
        return (
            <Tabs
                label={msg('home.sections.browse')}
                statePath='terminal'>
                {({id}) => <FileBrowser id={id}/>}
            </Tabs>
        )
    }
}
