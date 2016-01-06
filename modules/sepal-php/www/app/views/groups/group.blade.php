@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'group'))
<!--header wrap end-->

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('groups', 'Manage Groups') }}</li>
        </ul>                
        <div class="help-div right">
            <a href="javascript:void(0)" id="help-button" class="sprite help-icon"></a>
        </div>  
    </div>
</section>

<!--popup loading div start here -->
<div class="popup-wrap" id="help-popup-wrap" style="display: none;">
    <div class="popup-container">
        <a class="close close-btn" id="help-close-button" href="#">x</a>
        <h5 class="text-left">Manage Groups</h5>
        <p class="text-left marg-no">This interface controls the visibility of groups that exist in the Linux environment. Disabled groups will not be visible to any other area of SEPAL and users cannot be added to these groups via the web interface.</p>
    </div>
</div>
<!--popup loading div end here -->

<!--content wrap start-->
<section class="content-wrap">
    <div class="container">

        <h2>Manage Groups</h2>


        <div class="clearfix"></div>
        <div class="table_user_list add_grp_table">

            <table>
                @if (!empty($groupLists))

                <tr>

                    <th scope="col">Group Name</th>
                    <th scope="col">Status</th>

                    <th scope="col">Action</th>
                </tr>
                {{--*/ $flag = 0  /*--}} 
                @foreach ($groupLists as $groupKey=>$groupValue)
                {{--*/ $flag++  /*--}} 
                <tr>

                    <td>{{ $groupValue }}</td>
                    <td>
                        @if($currentData)
                        @if (in_array($groupValue, $currentData))
                        Disabled
                        @else
                        Enabled
                        @endif
                        @endif
                    </td>
                    <td>
                        @if($currentData)
                        @if (in_array($groupValue, $currentData))
                        <span eq="{{$flag}}" data="{{ $groupValue }}" class="button action_btn enableGroup">Enable</span>

                        @else
                        <span eq="{{$flag}}" data="{{ $groupValue }}" class="button action_btn blockgroup">Disable</span>

                        @endif
                        @endif

                    </td>
                </tr>


                @endforeach

                @else
                <tr>
                    <th align="center"> No matching records found!</th>
                </tr>
                @endif

            </table>


        </div>                
    </div>



</div>
</section>
<!--content wrap end-->
@stop 
