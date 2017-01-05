/**
 * @author Mino Togna
 */

require( './browse.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )
var Model    = require( './browse-m' )
var Dialog   = require( '../dialog/dialog' )

// html
var html = null

var browseContentRow = null
var fileName         = null
var btnDownload      = null
var btnDelete        = null
var btnAddToMap      = null
var btnFilterImages  = null
// var lastAbsPathClick = null
var lastClickItem    = []

var imagesExtensions = [ 'shp', 'tif', 'tiff', 'vrt' ]
var filterImages     = false

var init = function () {
    var template = require( './browse.html' )
    html         = $( template( {} ) )
    
    var appSection = $( '#app-section' ).find( '.browse' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        browseContentRow = html.find( '.browse-content-row' )
        fileName         = html.find( '.filename' )
        btnDownload      = html.find( '.btn-download' )
        btnDelete        = html.find( '.btn-delete' )
        btnAddToMap      = html.find( '.btn-add-to-map' )
        btnFilterImages  = html.find( '.btn-filter-images' )
        
        btnDownload.click( function ( e ) {
            e.preventDefault()
            var absPath = Model.absolutePath( lastClickItem[ 0 ].level, lastClickItem[ 1 ].name )
            EventBus.dispatch( Events.SECTION.BROWSE.DOWNLOAD_ITEM, null, absPath )
        } )
        
        btnFilterImages.click( function ( e ) {
            var files = browseContentRow.find( '.other-file' )
            if ( filterImages ) {
                files.fadeIn()
                filterImages = false
                btnFilterImages.removeClass( 'active' )
            } else {
                files.fadeOut( 200 )
                filterImages = true
                btnFilterImages.addClass( 'active' )
            }
        } )
        
        btnDelete.click( function ( e ) {
            e.preventDefault()
            Dialog.show( {
                message: 'Do you want to delete the selected file?', onConfirm: function () {
                    EventBus.dispatch( Events.SECTION.BROWSE.DELETE_ITEM, null, lastClickItem[ 0 ], lastClickItem[ 1 ] )
                }
            } )
        } )
        
        $( window ).resize( function () {
            setContentSize()
        } )
        
    }
    
    lastClickItem = []
    btnDownload.prop( 'disabled', true )
    btnDelete.prop( 'disabled', true )
    btnAddToMap.prop( 'disabled', true )
    fileName.html( '' )
}

var show = function ( e, type ) {
    if ( type == 'browse' ) {
        setTimeout( function () {
            setContentSize()
        }, 1500 )
    }
}

var setContentSize = function () {
    browseContentRow.width( browseContentRow.parent().width() + 'px' )
    browseContentRow.height( browseContentRow.parent().height() + 'px' )
}

var addDir = function ( dir ) {
    var level = dir.level
    removeDir( level )
    
    var colLevel = $( '<div class="col-sms-3 height100 level level-' + level + '" />' )
    browseContentRow.append( colLevel )
    
    var rowHeader = $( '<div class="dir-header width100 height10"/>' )
    colLevel.append( rowHeader )
    var colHeader = $( '<div class="text-align-center width100 height100"/>' )
    colHeader.append( dir.path )
    colHeader.attr( 'title', dir.path )
    rowHeader.append( colHeader )
    
    var colC = $( '<div class="dir-content height90"/>' )
    colLevel.append( colC )
    
    // if ( dir.children.length <= 0 ) {
    // var childDivR = $( '<div class="row dir-child"/>' )
    // colC.append( childDivR )
    // var childDivC = $( '<div class="col-sm-12">&nbsp;</div>' )
    // childDivR.append( childDivC )
    // }
    
    $.each( dir.children, function ( i, child ) {
        // add non hidden files
        if ( child.name.indexOf( '.' ) != 0 ) {
            
            var childDivR = $( '<div class="dir-child width100"/>' )
            colC.append( childDivR )
            
            var childDivC = $( '<div class="file-name"/>' )
            childDivC.attr( 'title', child.name )
            childDivR.append( childDivC )
            
            var isImageFile = isImage( child )
            if ( child.isDirectory === true ) {
                childDivC.append( '<i class="fa fa-folder icon-folder" aria-hidden="true"></i> ' + child.name )
                childDivC.addClass( 'width90' )
                
                var childDivL = $( '<div class="width10 text-align-left"/>' )
                childDivL.append( '<i class="fa fa-caret-right" aria-hidden="true"></i>' )
                childDivR.append( childDivL )
            } else {
                childDivC.addClass( 'width100' )
                
                if ( isImageFile ) {
                    childDivC.append( '<i class="fa fa-file-image-o" aria-hidden="true"></i> ' + child.name )
                    childDivR.addClass( 'image-file' )
                } else {
                    childDivC.append( '<i class="fa fa-file-o" aria-hidden="true"></i> ' + child.name )
                    childDivR.addClass( 'other-file' )
                    
                    if ( filterImages ) {
                        childDivR.hide()
                    }
                }
                
            }
            
            childDivR.click( function ( e ) {
                colC.find( 'div.dir-child.active' ).removeClass( 'active' )
                childDivR.addClass( 'active' )
                
                lastClickItem = [ dir, child ]
                
                EventBus.dispatch( Events.SECTION.BROWSE.NAV_ITEM_CLICK, null, dir.level, child )
                
                btnDelete.prop( 'disabled', false )
                fileName.html( child.name )
                
                if ( child.isDirectory === true ) {
                    btnDownload.prop( 'disabled', true )
                    btnAddToMap.prop( 'disabled', true )
                } else {
                    // var absPath = Model.absolutePath( dir.level, child.name )
                    // lastAbsPathClick = absPath
                    
                    btnDownload.prop( 'disabled', false )
                    if ( isImageFile ) {
                        // btnAddToMap.prop( 'disabled', false )
                    }
                }
            } )
        }
    } )
    
    colLevel.velocity( 'scroll', {
        container : browseContentRow
        , duration: 1500
        , delay   : 50
        , axis    : "x"
        , easing  : "easeInOutSine"
    } )
    
}

var removeDir = function ( level ) {
    browseContentRow.find( '.level-' + level ).nextAll().andSelf().remove()
}

var isImage = function ( file ) {
    var ext = file.name.substring( file.name.lastIndexOf( '.' ) + 1 )
    return imagesExtensions.indexOf( ext ) !== -1
}

EventBus.addEventListener( Events.SECTION.SHOW, show )

module.exports = {
    init       : init
    , addDir   : addDir
    , removeDir: removeDir
}