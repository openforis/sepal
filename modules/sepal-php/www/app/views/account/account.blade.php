@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'account'))
<!--header wrap end-->


{{ HTML::script('js/tooltip.js'); }}
{{ HTML::script('js/jquery.argonbox.js'); }}
<script type="text/javascript">
    $(document).ready(function () {

        $('.tooltip-hide').tooltip('hide');
    });

</script>

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('account', 'Account') }}</li>
        </ul>
        <div class="help-div right">
            <a href="javascript:void(0)" id="help-button" class="sprite help-icon"></a>
        </div>
        <ul class="bread-crumb right" style="padding-right: 10px">
            <li><a href="javascript:void(0)" onclick="openMigrationStatus();">Downloads</a></li>
        </ul>
    </div>
</section>
<!--popup loading div start here -->
<div class="popup-wrap" id="help-popup-wrap" style="display: none;">
    <div class="popup-container">
        <a class="close close-btn" id="help-close-button" href="#">x</a>
        <div class="popup-heading"><h5 class="text-left">Account</h5></div>
        <p class="text-left marg-no">Welcome to SEPAL. SEPAL is a cloud computing platform for geographical data
            processing. It enables users to quickly process large amount of data without high network bandwidth
            requirements or need to invest in high-performance computing infrastructure.
        </p>
    </div>
</div>
<!--popup loading div end here -->
<!--content wrap start-->
<section class="content-wrap">
    <div class="container">

        <h2>Monthly Budget</h2>
        <table class="table">
            <tr>
                <th class="text-left"></th>
                <th class="text-left">Spending</th>
                <th class="text-left">Budget</th>
            </tr>
            <tr>
                <td>Instance budget</td>
                <td>{{ number_format($info['monthlyInstanceSpending'], 2) }} USD</td>
                <td>{{ number_format($info['monthlyInstanceBudget'], 2) }} USD</td>
            </tr>
            <tr>
                <td>Storage budget</td>
                <td>{{ number_format($info['monthlyStorageSpending'], 2) }} USD</td>
                <td>{{ number_format($info['monthlyStorageBudget'], 2) }} USD</td>
            </tr>
            <tr>
                <td>Storage usage</td>
                <td>{{ number_format($info['storageUsed'], 2) }} GB</td>
                <td>{{ number_format($info['storageQuota'], 2) }} GB</td>
            </tr>
        </table>

        <h2>Sessions</h2>
        <i id="no-sandbox-sessions" class="hidden">You have no sessions.</i>
        <table id="sandbox-sessions" class="table hidden">
            <tr>
                <th class="text-left">Time since creation</th>
                <th class="text-left">Instance type</th>
                <th class="text-left">Cost since creation</th>
                <th class="text-left"></th>
            </tr>
            @foreach ($info['sessions'] as $session)
            <tr class="sandbox-session">
                <td>{{ DateFormatter::since(DateTime::createFromFormat('Y-m-d\TH:i:s', $session['creationTime'])) }}</td>
                <td>{{ $session['instanceType']['name'] }}</td>
                <td>{{ number_format($session['costSinceCreation'], 2) }} USD</td>
                <td class="text-danger">
                    <a class="text-danger close-session" href="{{ $session['id'] }}">
                        <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                        close</a>
                </td>
            </tr>
            @endforeach
        </table>
    </div>
</section>

<script>
    $(function () {
        var initSessions = function () {
            if ($('.sandbox-session').length > 0) {
                $('#sandbox-sessions').removeClass('hidden')
                $('#no-sandbox-sessions').addClass('hidden')
            } else {
                $('#sandbox-sessions').addClass('hidden')
                $('#no-sandbox-sessions').removeClass('hidden')
            }
        }
        $('.close-session').click(function () {
            var anchor = $(this)
            var sessionId = anchor.attr('href')
            $.post('closesession', {sessionId: sessionId}, function () {
                anchor.closest('tr').remove()
                initSessions()
            })
            return false
        })
        initSessions()
    })
</script>
<!--content wrap end-->
@stop

