/**
 * @author Mino Togna
 */

require( './browse.css' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )
var Model    = require( './browse-m' )

// html
var template         = require( './browse.html' )
var html             = $( template( {} ) )
var browseContentRow = null
var downloadBtn      = null
var lastAbsPathClick = null

var init = function () {
    var appSection = $( '#app-section' ).find( '.browse' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        
        browseContentRow = html.find( '.browse-content-row' )
        downloadBtn      = html.find( '.btn-download' )
        downloadBtn.click( function ( e ) {
            e.preventDefault()
            EventBus.dispatch( Events.SECTION.BROWSE.DOWNLOAD_ITEM, null, lastAbsPathClick )
        } )
        downloadBtn.prop( 'disabled', true )
        // setTimeout( function () {
        //     setContentSize()
        // }, 1500 )
        
        $( window ).resize( function () {
            setContentSize()
        } )
        
    }
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
    
    // var colLevel = $( '<div class="height100 level level-' + dir.level + '" />' )
    var colLevel = $( '<div class="col-sms-3 height100 level level-' + level + '" />' )
    browseContentRow.append( colLevel )
    
    var rowH = $( '<div class="dir-header width100 height10"/>' )
    colLevel.append( rowH )
    var colH = $( '<div class="text-align-center width100 height100"/>' )
    colH.append( dir.path )
    rowH.append( colH )
    
    // var rowC = $( '<div class="row dir-content height90"/>' )
    // colLevel.append( rowC )
    // var colC = $( '<div class="col-sm-12 text-align-left overflow-auto height100"/>' )
    // rowC.append( colC )
    var colC = $( '<div class="dir-content height90"/>' )
    colLevel.append( colC )
    
    if ( dir.children.length <= 0 ) {
        // var childDivR = $( '<div class="row dir-child"/>' )
        // colC.append( childDivR )
        // var childDivC = $( '<div class="col-sm-12">&nbsp;</div>' )
        // childDivR.append( childDivC )
    }
    
    $.each( dir.children, function ( i, child ) {
        var childDivR = $( '<div class="dir-child width100"/>' )
        colC.append( childDivR )
        var childDivC = $( '<div class="file-name"/>' )
        childDivC.append( child.name )
        childDivR.append( childDivC )

        if ( child.name.indexOf( '.' ) == 0 ) {
            childDivR.addClass( 'hidden-file' )
        }

        if ( child.isDirectory === true ) {
            childDivC.addClass( 'width90' )
            var childDivL = $( '<div class="width10 text-align-left"/>' )
            childDivL.append( '<i class="fa fa-caret-right" aria-hidden="true"></i>' )
            childDivR.append( childDivL )
        } else {
            childDivC.addClass( 'width100' )
        }
        
        childDivR.click( function ( e ) {
            colC.find( 'div.dir-child.active' ).removeClass( 'active' )
            childDivR.addClass( 'active' )
            
            EventBus.dispatch( Events.SECTION.BROWSE.NAV_ITEM_CLICK, null, dir.level, child )
            
            if ( child.isDirectory === true ) {
                downloadBtn.html( '<i class="fa fa-download" aria-hidden="true"></i> -' )
                downloadBtn.prop( 'disabled', true )
            } else {
                var absPath      = Model.absolutePath( dir.level, child.name )
                absPath          = absPath.substring( 0, absPath.length - 1 )
                lastAbsPathClick = absPath
                downloadBtn.html( '<i class="fa fa-download" aria-hidden="true"></i>' + absPath )
                downloadBtn.prop( 'disabled', false )
            }
        } )
        
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

EventBus.addEventListener( Events.SECTION.SHOW, show )

module.exports = {
    init       : init
    , addDir   : addDir
    , removeDir: removeDir
}