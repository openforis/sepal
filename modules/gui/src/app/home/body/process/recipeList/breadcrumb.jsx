import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'

import styles from './breadcrumb.module.css'
import {folderPath, ROOT} from './recipeTree'

export class Breadcrumb extends React.Component {
    render() {
        const {projects, folderId} = this.props
        const path = folderPath(projects, folderId)
        // A folderId with no path means the folder was removed underneath us: home is then not the
        // current segment, so it stays clickable and the list never strands with no way out.
        const atHome = path.length === 0 && !folderId
        return (
            <Layout type='horizontal-nowrap' spacing='none'>
                {this.renderSegment({id: ROOT, name: msg('process.recipeList.root'), icon: 'house'}, atHome)}
                {path.map((segment, index) =>
                    <React.Fragment key={segment.id}>
                        <div className={styles.separator}>/</div>
                        {this.renderSegment(segment, index === path.length - 1)}
                    </React.Fragment>
                )}
            </Layout>
        )
    }

    // The last segment names where you already are, so it reads as a label rather than a way out.
    // The underline sits on the label rather than the button: a flex container does not pass text
    // decoration down to its items.
    renderSegment({id, name, icon}, current) {
        const {onNavigate} = this.props
        return current
            ? (
                <div className={styles.current}>
                    {icon ? <Icon name={icon}/> : null}
                    <span>{name}</span>
                </div>
            )
            : (
                <button
                    type='button'
                    className={styles.link}
                    onClick={() => onNavigate(id)}>
                    {icon ? <Icon name={icon}/> : null}
                    <span className={styles.label}>{name}</span>
                </button>
            )
    }
}

Breadcrumb.propTypes = {
    projects: PropTypes.array.isRequired,
    folderId: PropTypes.string,
    onNavigate: PropTypes.func.isRequired
}
