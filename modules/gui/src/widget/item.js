import Highlight from 'react-highlighter'
import Icon from './icon'
import PropTypes from 'prop-types'
import React from 'react'
import moment from 'moment'
import styles from './item.module.css'

export class Item extends React.Component {
    render() {
        return (
            <div className={styles.item}>
                {this.renderIcon()}
                {this.renderImage()}
                {this.renderInfo()}
                {this.renderTimestamp()}
                {this.renderInline()}
            </div>
        )
    }

    renderIcon() {
        const {icon, iconSize, iconType, iconVariant} = this.props
        return icon
            ? (
                <div className={styles.icon}>
                    <Icon
                        name={icon}
                        size={iconSize}
                        type={iconType}
                        variant={iconVariant}
                    />
                </div>
            )
            : null
    }

    renderImage() {
        const {image} = this.props
        return image
            ? (
                <div className={styles.image}>
                    {image}
                </div>
            )
            : null
    }

    renderTitle() {
        const {title, highlightTitle} = this.props
        return title
            ? (
                <div className={styles.title}>
                    {this.renderHighlight(title, highlightTitle)}
                </div>
            )
            : null
    }

    renderDescription() {
        const {description, highlightDescription} = this.props
        return description
            ? (
                <div className={styles.description}>
                    {this.renderHighlight(description, highlightDescription)}
                </div>
            )
            : null
    }

    renderInfo() {
        const {title, description, nonClickable} = this.props
        return title || description
            ? (
                <div className={[styles.info, nonClickable ? styles.nonClickable : styles.clickable].join(' ')}>
                    {this.renderTitle()}
                    {this.renderDescription()}
                </div>
            )
            : null
    }

    renderTimestamp() {
        const {timestamp} = this.props
        return timestamp
            ? (
                <div className={styles.timestamp}>
                    {moment(timestamp).fromNow()}
                </div>
            )
            : null
    }

    renderInline() {
        const {children} = this.props
        return (
            <div className={styles.inline}>
                {children}
            </div>
        )
    }

    renderHighlight(content, enabled) {
        const {highlight, highlightClassName} = this.props
        return highlight && enabled
            ? (
                <Highlight
                    search={highlight}
                    ignoreDiacritics={true}
                    matchClass={highlightClassName || styles.highlight}>
                    {content}
                </Highlight>
            )
            : content
    }
}

Item.propTypes = {
    children: PropTypes.any,
    description: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
    highlight: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    highlightClassName: PropTypes.string,
    highlightDescription: PropTypes.any,
    highlightTitle: PropTypes.any,
    icon: PropTypes.any,
    iconSize: PropTypes.any,
    iconType: PropTypes.string,
    iconVariant: PropTypes.string,
    image: PropTypes.any,
    nonClickable: PropTypes.any,
    timestamp: PropTypes.any,
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
}

Item.defaultProps = {
    highlightDescription: true,
    highlightTitle: true
}
