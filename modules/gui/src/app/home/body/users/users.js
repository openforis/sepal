import React from 'react'

import {msg} from '~/translate'
import {Tabs} from '~/widget/tabs/tabs'

import {UserBrowser} from './userBrowser'

export class Users extends React.Component {
    render() {
        return (
            <Tabs
                label={msg('home.sections.users')}
                statePath='users'>
                {() => <UserBrowser/>}
            </Tabs>
        )
    }
}
