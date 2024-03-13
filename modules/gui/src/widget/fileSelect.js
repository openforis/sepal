import {msg} from '~/translate'
import {useDropzone} from 'react-dropzone'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './fileSelect.module.css'

export const FileSelect = ({multiple, single, accept, onSelect, children}) => {
    const {getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject} = useDropzone({
        multiple: multiple || !single,
        accept,
        onDrop: files => onSelect(single ? files[0] : files),
    })
    
    const reject = isDragReject || (isDragActive && !isDragAccept)

    const classNames = [
        styles.dropZone,
        isDragAccept ? styles.dragAccept : null,
        reject ? styles.dragReject : null
    ]

    return (
        <div {...getRootProps({className: classNames.join(' ')})}>
            <input {...getInputProps()}/>
            <div>
                {reject
                    ? multiple
                        ? msg('widget.fileSelect.multiple.reject')
                        : msg('widget.fileSelect.single.reject')
                    : isDragAccept
                        ? multiple
                            ? msg('widget.fileSelect.multiple.drop')
                            : msg('widget.fileSelect.single.drop')
                        : children
                            || (multiple
                                ? msg('widget.fileSelect.multiple.dropOrClick')
                                : msg('widget.fileSelect.single.dropOrClick'))
                }
            </div>
        </div>
    )
}

FileSelect.propTypes = {
    onSelect: PropTypes.func.isRequired,
    accept: PropTypes.any,
    multiple: PropTypes.any,
    single: PropTypes.any,
}
