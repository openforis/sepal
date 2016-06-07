/**
 * @author Mino Togna
 */
require( './tasks.css' )

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var Animation = require( '../animation/animation' )
var Model     = require( './tasks-m' )

// html
var template = require( './tasks.html' )
var html     = $( template( {} ) )

var rowTask   = html.find( '.row.task' )
var rowHeader = html.find( '.row.row-header' )
var container = html.find( '.tasks-container' )

var init = function () {
    var appSection = $( '#app-section' ).find( '.tasks' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
    }
}

var reset = function () {
    container.find( '.task' ).remove()
}

var setTasks = function ( tasks ) {
    $.each( tasks, function ( i, task ) {
        var row = getTaskRow( i, task )
        row.find( '.status' ).html( getTaskStatus( task.status ).tooltip() )
    } )
}

var getTaskRow = function ( index, task ) {
    var taskUIRow = container.find( '.task-' + task.id )
    if ( taskUIRow.length ) {
    } else {
        taskUIRow = rowTask.clone()
        taskUIRow.addClass( 'task-' + task.id )
        taskUIRow.find( '.name' ).html( task.name )
        container.append( taskUIRow )
        
        setTimeout( function () {
            Animation.animateIn( taskUIRow )
        }, index * 50 )
    }
    return taskUIRow
}

module.exports = {
    init      : init
    , reset   : reset
    , setTasks: setTasks
}

var getTaskStatus = function ( status ) {
    var icon = ''
    switch ( status ) {

        case Model.STATUS.ACTIVE:
            icon = '<i class="fa fa-refresh fa-spin fa-active" aria-hidden="true"' +
                'data-toggle="tooltip" data-placement="top" title="Active"></i>'
            break;
        case Model.STATUS.PENDING:
            icon = '<i class="fa fa-hand-paper-o fa-pending" aria-hidden="true"' +
                'data-toggle="tooltip" data-placement="top" title="Pending"></i>'
            break;
        case Model.STATUS.FAILED:
            icon = '<i class="fa fa-exclamation-triangle fa-failed" aria-hidden="true"' +
                'data-toggle="tooltip" data-placement="top" title="Failed"></i>'
            break;
        case Model.STATUS.COMPLETED:
            icon = '<i class="fa fa-thumbs-up fa-completed" aria-hidden="true"' +
                'data-toggle="tooltip" data-placement="top" title="Completed"></i>'
            break;
    }

    return $( icon )
}
