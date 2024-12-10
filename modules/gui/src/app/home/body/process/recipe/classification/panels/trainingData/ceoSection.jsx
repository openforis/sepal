import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {withActivators} from '~/widget/activation/activator'
import {Layout} from '~/widget/layout'

import {CeoLogin} from './ceoLogin'
import {CeoConnected, CeoDisconnected} from './ceoProjects'

const mapStateToProps = () => {
    return {
        token: select('ceo.session.token')
    }
}

export class _CeoSection extends React.Component {
    render() {
        const {token} = this.props
        return (
            <Layout>
                {token ? <CeoConnected/> : <CeoDisconnected/>}
                <CeoLogin/>
            </Layout>
        )
    }
}

export const CeoSection = compose(
    _CeoSection,
    connect(mapStateToProps),
    withActivators('ceoLogin')
)

