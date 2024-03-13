import {Tabs} from '~/widget/tabs/tabs'
import {UserBrowser} from './userBrowser'
import {msg} from '~/translate'
import React from 'react'

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
