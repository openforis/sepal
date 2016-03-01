@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'user'))
<!--header wrap end-->

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('users', 'List Users') }}</li>
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
        <div class="popup-heading"><h5 class="text-left">List user</h5></div>
        <p class="text-left marg-no">This interface allows administrators to update user information, and reset a
            password.</p>
    </div>
</div>
<!--popup loading div end here -->

<!--content wrap start-->
<section class="content-wrap">
    <div class="container">
        <h2>List user</h2>
        {{ Form::open(array('url'=>'users','method'=>'post')) }}
        <div class="box-wrap" style="padding-top:15px;">
            <div class="table_user_list">

                <table>
                    @if (!empty($userLists))
                    <tr>
                        <th scope="col">Name</th>
                        <th scope="col">User Name</th>
                        <th scope="col">Email</th>
                        <th scope="col">Role</th>
                        <th scope="col">Action</th>
                    </tr>
                    @foreach ($userLists as $userList)

                    <tr>
                        <td>{{ $userList->full_name }}</td>
                        <td>{{ $userList->username }}</td>
                        <td>{{ $userList->email }}</td>
                        <td>
                            @foreach($userList->roles as $role)
                            {{$role->role_name}}
                            @endforeach
                        </td>
                        <td id="user_{{$userList->id}}">
                            @if(Session::get('is_admin')=='yes')
                            {{ HTML::link('users/edit/'.$userList->id, 'Edit',array('class'=>'button action_btn')) }}
                            {{ HTML::link('users/del/'.$userList->id, 'Delete',array('class'=>'button action_btn')) }}
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
            {{Form::close()}}
        </div>


        <!-- pagination start here -->
        <div class="pagination-wrap">
                        <span class="pull-left">Displaying {{ $userLists->getFrom() }} - {{ $userLists->getTo() }} of 
                        {{ number_format($userLists->getTotal()) }} results</span>
            <div class="clearboth"></div>
            {{ $userLists->links() }}
        </div>
        <!-- pagination end here -->

    </div>
</section>
<!--content wrap end-->


@stop 
