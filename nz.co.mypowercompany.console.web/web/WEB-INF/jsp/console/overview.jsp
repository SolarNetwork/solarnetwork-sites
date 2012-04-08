<div class="dashboard_overview">
		<div class="dashboard_graph">
		
			<div id="main-div" class="chart-box" style="width:1000px;">
				<div id="chart-div" class="chart-container" style="width:1000px;height:200px;margin-left:10px"></div>
				<div id="chart-overview-div" class="chart-container" style="width:1000px;height:80px;"></div>
			</div>
		
		</div>	
		
		<div id="footer">
			<div id="footer_message" style="display:none"><p>your current effect on the planet: <span id="footer_env_effect"></span></p></div>
		</div>
		
		<div class="dashboard_dials">
		
			<div class="dashboard_weather">
				<div class="weather_icon"></div>
				<div class="dashboard_weather_details">
				<p>Current Weather</p>
				<p class="dashboard_temp"><span id="current_temp"></span>&deg;C</p>
				</div>
			</div>
			
			<div id="dashboard_wires" class="dashboard_wires_default">
				<div id="dashboard_house_wires" class="dashboard_house_wires_default"></div>
				<div id="dashboard_pv_wires" class="dashboard_pv_wires_default"></div>
				<div id="dashboard_grid_wires" class="dashboard_grid_wires_default"></div>
			</div>
			
			<div id="dashboard_savings" class="dashboard_savings_default">
				<div id="dashboard_savings_money" class="dashboard_label"><span id="dashboard_savings_money_value">$0.00</span><p class="dashboard_info">money saved</p></div>
				<div id="dashboard_savings_power" class="dashboard_label"><span id="dashboard_savings_power_value">0.0</span><span>kWH</span><p class="dashboard_info">power saved</p></div>
			</div>
			
			<div id="dashboard_battery" class="battery_default"></div>
			
			<div id="dashboard_solar" class="dashboard_solar_off">
				<div id="dashboard_solar_generated" class="dashboard_label"><span id='dashboard_pv_generating_value'>0</span><span>W</span><p class="dashboard_info">generating</p></div>
				<div id="dashboard_solar_efficiency" class="dashboard_label"><span>0%</span><p class="dashboard_info">efficiency</p></div>
			</div>
			
			<div id="dashboard_grid" class="dashboard_grid_off">
				<div id="dashboard_grid_price" class="dashboard_label"><span id="dashboard_grid_price_value">$0.00</span><p class="dashboard_info">price per unit</p></div>
				<div id="dashboard_grid_drawn" class="dashboard_label"><span id="dashboard_grid_drawing_value">0</span><span>W</span><p class="dashboard_info">drawing from grid</p></div></div>
			
			<div class="clear"></div>
		</div>
		
		<div class="clear"></div>
</div>