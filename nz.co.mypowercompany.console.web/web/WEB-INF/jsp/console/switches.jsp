
	<form method="post" class="switchForm">
		<input type="hidden" name="nodeId" value="${param['nodeId']}"></input>
		<input type="hidden" name="topic" value="SetControlParameter"></input>
		<input type="hidden" name="parameters[0].name" value="/power/switch/1"></input>
		<input type="hidden" name="parameters[0].value" value="1"></input>
		<input type="image" id="switch_aux_1" value="" src="images/console/switch_aux_1_off.png" disabled="disabled"></input>
	</form>
	
	<form method="post" class="switchForm">
		<input type="hidden" name="nodeId" value="${param['nodeId']}"></input>
		<input type="hidden" name="topic" value="SetControlParameter"></input>
		<input type="hidden" name="parameters[0].name" value="/power/switch/2"></input>
		<input type="hidden" name="parameters[0].value" value="1"></input>
		<input type="image" id="switch_aux_2" value="" src="images/console/switch_aux_2_off.png" disabled="disabled"></input>
	</form>
	
	<form method="post" class="switchForm">
		<input type="hidden" name="nodeId" value="${param['nodeId']}"></input>
		<input type="hidden" name="topic" value="SetControlParameter"></input>
		<input type="hidden" name="parameters[0].name" value="/power/switch/3"></input>
		<input type="hidden" name="parameters[0].value" value="1"></input>
		<input type="image" id="switch_aux_3" value="" src="images/console/switch_aux_3_off.png" disabled="disabled"></input>
	</form>
	
	<form method="post" class="switchForm">
		<input type="hidden" name="nodeId" value="${param['nodeId']}"></input>
		<input type="hidden" name="topic" value="SetControlParameter"></input>
		<input type="hidden" name="parameters[0].name" value="/power/switch/grid"></input>
		<input type="hidden" name="parameters[0].value" value="1"></input>
		<input type="image" id="switch_grid" value="" src="images/console/switch_grid_off.png" disabled="disabled"></input>
	</form>