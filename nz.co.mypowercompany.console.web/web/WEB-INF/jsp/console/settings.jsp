<%-- Stubbed page to display settings --%>

<div class="settings">
	<form method="post">
		<fieldset>
			<legend>Price Behaviour:</legend>
			
			<div class="ui-widget" style="float:right; width: 300px; ">
				<div class="ui-state-highlight ui-corner-all" style="padding: 10px;;"> 
					<span class="ui-icon ui-icon-info" style="float: left; margin-right: .3em;"></span>
					<p style="margin-left:20px">When "auto" is enabled switches will be changed automatically based upon the current price and the limits set here.</p>
				</div>
			</div>
	
			<label for="auto">Auto</label>
			<input type="checkbox" name="auto"/><br/>
	
			<label for="buy">Buy</label>
			<input type="text" name="buy" value="20"/>cents<br/>
	
			<label for="never_consume">Price Limit</label>
			<input type="text" name="never_consume" value="150"/>cents<br/>
			
			<input type="submit" value="Save"/>
		</fieldset>
	</form>
</div>