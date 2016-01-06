<ul class="row">

	@if (isset($userFolder) && count($userFolder)>0)
 
                               
	@foreach ($userFolder as $folderKey=>$folderValue)
{{-- */$folderwithpath =$folderPath.'/'.$folderValue;/* --}}
{{-- */$file_ext =pathinfo($folderwithpath,PATHINFO_EXTENSION)/* --}}
{{-- */$validextensions = array("jpeg", "jpg", "png","gif","tif");/* --}}
<li>
@if(isset($file_ext) && $file_ext !="")
@if(in_array($file_ext,$validextensions))
<div  style="cursor:inherit;text-align:center;">
<div class="folder-name">


{{-- */ $path= "/home/".$userName."/".$folderwithpath;/* --}}
{{-- */ $type = pathinfo($path, PATHINFO_EXTENSION);/* --}}
{{-- */ $data = file_get_contents($path);/* --}}
{{-- */ $base64 = 'data:image/' . $type . ';base64,' . base64_encode($data);/* --}}
{{-- */ $image ='<img src='.$base64.'>'; /* --}} 

	{{ $image }}
	{{ $folderValue }}

</div>
</div>
@else
<div  style="background-image: url('images/icon_file_large.png');cursor:inherit;background-repeat: no-repeat;height:20px;min-width:20px;text-align:center;padding-top:66px;background-position:11px 12px;">
 <pre class="folder-name">{{ $folderValue }}</pre>
</div>
@endif
@else	
      	<div class="">
                                        <span class="sprite folder-icon"></span>
                                        <pre class="folder-name folderPath" path="{{ $folderPath.'/'.$folderValue }}">{{ $folderValue }}</pre>
                                    
	</div>
@endif
</li>
    	@endforeach

	@endif	
</ul>

