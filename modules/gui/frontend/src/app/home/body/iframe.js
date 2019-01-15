import {CenteredProgress} from 'widget/progress'
import {appReady, appState} from 'apps'
import {connect} from 'store'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import {Content, SectionLayout} from 'widget/sectionLayout'

const mapStateToProps = (_, currentProps) => ({
    appState: appState(currentProps.app.path),
})

class IFrame extends React.Component {
    initializing(label, alt) {
        return <CenteredProgress title={msg('apps.initializing', {label: label || alt})}/>
    }
    loading(label, alt) {
        return <CenteredProgress title={msg('apps.loading.progress', {label: label || alt})}/>
    }
    render() {
        const {app: {path, label, alt}, appState} = this.props
        if (appState === 'REQUESTED')
            return this.initializing(label, alt)

        return appState === 'REQUESTED'
            ? this.initializing(label, alt)
            : (
                <SectionLayout>
                    <Content padding={false}>
                        {appState !== 'READY' && this.loading(label, alt)}
                        <iframe
                            width='100%'
                            height='100%'
                            frameBorder='0'
                            src={'/api' + path}
                            title={label || alt}
                            style={{display: appState === 'READY' ? 'block' : 'none'}}
                            onLoad={() => appReady(this.props.app)}
                        />
                        </Content>
                </SectionLayout>
            )
    }
}

IFrame.propTypes = {
    app: PropTypes.shape({
        alt: PropTypes.string,
        label: PropTypes.string,
        path: PropTypes.string
    }),
    appState: PropTypes.string
}

IFrame.contextTypes = {
    active: PropTypes.bool,
    focus: PropTypes.func
}

export default connect(mapStateToProps)(IFrame)
