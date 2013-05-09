/**
 * Selects the passed in menu item
 * @param menuItem
 */
function changeTab(menuItem) {
	
	// Change the menu item
	$('.menu_item').removeClass('selected');
	$(menuItem).parent().addClass('selected');
	
	// Change the tab
	$('.tab_content').hide();
	$('.tab_content.' + menuItem.hash.substr(1)).show();
};

function MPCConsole() {
	/** This console instance. */
	var mpcConsole = this;
	/** Caches the condition svg data. */
	var conditionCache = {};
	
	// TODO remove fields used for debug
	var debugPvWatts = null;
	var debugIntervalCost = null;
	var debugIntervalWattHours = null;
	
	// We store references to the data that's been loaded;
	var intervalCost = 0;
	var intervalWattHours = 0;
	var pvOn = false;
	/** The effect that is currently being displayed. */
	var currentEffect = null;

	var getCredentials = function() {
		var form = $('#credentials')[0];
		var params = {
				token: form.elements['token'].value,
				secret: form.elements['secret'].value,
				host: document.location.host,
				date: new Date().toUTCString()
			};
		return params;
	};
	
	this.startRefreshTimer = function(nodeId) {
		var self = this;
		setInterval(function() {
					self.populateConsole(nodeId);
		}, 60000);
	};

	/**
	 * This populates the MPC console with data for the specified node.
	 * @param nodeId
	 */
	this.populateConsole = function(nodeId) {
		mpcConsole.debug('Loading node ' + nodeId);
		
		$.getJSON('/solarquery/consumptionData.json?nodeId=' + nodeId + '&mostRecent=true', function(data) {
			mpcConsole.debug('Retrieved consumption data');
			if (data.data.length) {
				mpcConsole.currentConsumptionData = data.data[0];
				mpcConsole.loadConsumptionData(data.data[0]);
			}
		});
		$.getJSON('/solarquery/powerData.json?nodeId=' + nodeId + '&mostRecent=true', function(data) {
			mpcConsole.debug('Retrieved power data');
			if (data.data.length) {
				mpcConsole.currentPowerData = data.data[0];
				mpcConsole.loadPowerData(data.data[0]);
			}
		});
		$.getJSON('/solarquery/hardwareControlData.json?nodeId=' + nodeId + '&mostRecent=true', function(data) {
			mpcConsole.debug('Retrieved hardware control data');
			mpcConsole.loadHardwareControlData(data.data);
	
			// Now enable all the switches, even those with no update returned as for MPC there should always be the four switches available
			$('.switchForm input[type=image]').removeAttr('disabled');
		});
		
		mpcConsole.populateWeather(nodeId);
		
		// Set up the switches
		$('.switchForm').submit(function(event) {
			event.preventDefault();
			var form = $(this);
			var login = $('#login-container').dialog({
				title: 'Please log in', 
				autoOpen: false,
				modal: true, 
				width: 450, 
				height: 300
			});
			var showLogin = function() {
				if ( login.dialog("isOpen") === false ) {
					login.dialog('open');
				}
			};
			var hideLogin = function() {
				if ( login.dialog("isOpen") === true ) {
					login.dialog('close');
				}
			};
			var submit = function() {
				if ( SNAPI.ajaxCredentials === undefined ) {
					showLogin();
				} else {
					hideLogin();
					SNAPI.requestJSON('/solaruser/api/v1/sec/instr/add', 'POST', form.formSerialize()).done(function(data) {
						if ( data.success !== true ) {
							if ( data.message === "ACCESS_DENIED" ) {
								alert("Bad credentials, please try again.");
								showLogin();
							} else {
								mpcConsole.debug('Unexpected error setting swtich: ' +data);
								alert('Unexpected error setting switch. Please try again later.');
							}
							return;
						}
						mpcConsole.debug('Switch:' +data.data.parameters[0].name +' updated to: ' + data.data.parameters[0].value);
						mpcConsole.updateSwitch(data.data.parameters[0].name, data.data.parameters[0].value);
					}).fail(function(xhr, status, reason) {
						if ( xhr.status === 401 ) {
							alert("Bad credentials, please try again.");
							showLogin();
						} else {
							mpcConsole.debug('Error setting swtich: ' +status +'; ' +reason);
							alert("Unknown error setting switch: " +reason);
						}
					});
				}
			};
			
			$('#credentials').submit(function(event) {
				event.preventDefault();
				SNAPI.ajaxCredentials = getCredentials();
				submit();
			});
			
			submit();
		});
		
		// Populate the graph
		$.ajax({
			type: 'GET',
			url:'/solarquery/reportableInterval.json',
			data: {
				nodeId:nodeId,
				types:['Consumption','Power']
			},
			dataType: 'json',
			traditional: true,
			success : function(data) {
					
					var chartInterval = {};
					chartInterval.eDate = Date.create(data.data.endDate);
					chartInterval.eDate.setHours(23,59,59,999);
					chartInterval.endDate = chartInterval.eDate.strftime(dateDataFormat);
					chartInterval.sDate = chartInterval.eDate.clone().add(-1, 'week');
					chartInterval.sDate.setHours(0,0,0,0);
					chartInterval.startDate = chartInterval.sDate.strftime(dateDataFormat);
					
					// Display the data for the interval
					mpcConsole.displayInterval(nodeId, chartInterval);
			}
		});
	};
	
	/**
	 * This displays the graph and figures (money/power saved) for the specified interval.
	 * @param nodeId
	 * @param chartInterval
	 */
	this.displayInterval = function(nodeId, chartInterval) {
		
		// Draw the graph
		setupChart(nodeId, chartInterval);// graph.js
		
		// Calculate and display the savings
		var queryParams = {
			nodeId: nodeId,
			startDate: chartInterval.startDate,
			endDate: chartInterval.endDate,
			aggregate: 'Day'
		};
		
		$.ajax({
			type: 'GET',
			url:'/solarquery/powerData.json',
			data: queryParams,
			dataType: 'json',
			traditional: true,
			success: function(data) {
				$(data.data).each(function(i, powerDataEntry) {
					if (powerDataEntry.cost && powerDataEntry.cost > 0) {
						intervalCost += powerDataEntry.cost;
					}
					if (powerDataEntry.wattHours && powerDataEntry.wattHours > 0) {
						intervalWattHours += powerDataEntry.wattHours;
					}
				});
				
				if (debugIntervalCost != null) {intervalCost = debugIntervalCost};
				if (debugIntervalWattHours != null) {intervalWattHours = debugIntervalWattHours};
				
				mpcConsole.debug("Interval cost:" + intervalCost + " WattHours:" + intervalWattHours);
				
				$('#dashboard_savings_money_value').html(intervalCost);
				$('#dashboard_savings_money_value').formatCurrency();
				$('#dashboard_savings_power_value').html(parseFloat(intervalWattHours/1000).toFixed(1));
				
				// Now that the interval data is loaded we can display the environmental effect
				mpcConsole.displayEnvironmentalEffect();
			}
		});
	};
	
	/**
	 * Loads the json data returned by powerData.json into the console.
	 * 
	 * @param powerData The most recent power data.
	 */
	this.loadPowerData = function(powerData) {
		mpcConsole.debug('Loading power data, watts: ' + powerData.watts);
	
		// Display current Watts for PV unit
		var watts = parseFloat(powerData.watts).toFixed(0);
		if (debugPvWatts != null) {watts = debugPvWatts;}// TODO remove debug
		$('#dashboard_pv_generating_value').html(watts);
		
		
		// Update the PV status
		pvOn = (watts > 0);
		
		// Get the location ID used for the price
		$.getJSON('/solarquery/priceData.json?locationId=' + powerData.locationId + '&mostRecent=true', function(data) {
			if (data.data.length) {
				mpcConsole.debug('Loading current price: ' + data.data[0].price + ' for location: ' + powerData.locationId);
				$('#dashboard_grid_price_value').html(data.data[0].price);
				$('#dashboard_grid_price_value').formatCurrency();
			} else {
				mpcConsole.debug('No current price data for location ' + powerData.locationId);
			}
		});
	};
	
	/**
	 * Loads the json data returned by consumptionData.json into the console.
	 * 
	 * @param consumptionData The consumption data
	 */
	this.loadConsumptionData = function(consumptionData) {
		mpcConsole.debug('Loading consumption data, watts:' + consumptionData.watts);
	
		// Display Watts for grid
		$('#dashboard_grid_drawing_value').html(parseFloat(consumptionData.watts).toFixed(0));
	};
	
	/**
	 * Loads the json data returned by hardwareControlData.json into the console.
	 * 
	 * @param hardwareControls The array of switch data
	 */
	this.loadHardwareControlData = function(hardwareControls) {
		mpcConsole.debug('Loading hardware control data');
		
		$.each(hardwareControls, function(idx, hardwareControl) {
			mpcConsole.debug(hardwareControl.sourceId + " = " + hardwareControl.integerValue);
			mpcConsole.updateSwitch(hardwareControl.sourceId, hardwareControl.integerValue);
		});
	};
	
	/**
	 * Changes the display of the switch based on the passed in value. Also updates the form for the
	 * switch to use the opposite value for when it submitted.
	 * 
	 * @param sourceId The SolarNet switch ID
	 * @param integerValue The current value of the switch.
	 */
	this.updateSwitch = function(sourceId, integerValue) {
		var switchId = mpcConsole.getSwitchIdForHardwareSourceId(sourceId);
		if (switchId) {
			var switchImg = mpcConsole.getSwitchImage(switchId, integerValue);
			
			mpcConsole.debug('Setting switch ' + switchId + ' to ' + switchImg);
			$('#'+switchId).attr('src', switchImg);
			
			mpcConsole.debug('switch is in mode: ' + integerValue + ' setting form to '+  (integerValue == 1 ? 0 : 1));
			$('#'+switchId).closest("form").find(' input[name="parameters[0].value"]').attr('value', (integerValue == 1 ? 0 : 1));
		}
	};
	
	this.getSwitchIdForHardwareSourceId = function(sourceId) {
		if (sourceId == '/power/switch/1') {
			return 'switch_aux_1';
		} else if (sourceId == '/power/switch/2') {
			return 'switch_aux_2';
		} else if (sourceId == '/power/switch/3') {
			return 'switch_aux_3';
		} else if (sourceId == '/power/switch/grid') {
			return 'switch_grid';
		} else {
			mpcConsole.debug('Unexpected source ID: ' + sourceId);
		}
	};
	
	/**
	 * Gets the class for a switch based on the passed in value.
	 * 
	 * @param switchId The local switch ID
	 * @param integerValue The value of the switch (1 is on, anything else off)
	 * @returns {String} the class to be used with the switch based on the value.
	 */
	this.getSwitchImage = function(switchId, integerValue) {
		if (integerValue == 1) {
			return 'images/console/' + switchId + '_on.png';
		}
		return 'images/console/' + switchId + '_off.png';
	};
	
	/**
	 * Logs a message to the browser console.
	 */
	this.debug = function(msg) {
		console.log(msg);
	};
	
	/**
	 * Populates the weather display of the console.
	 */
	this.populateWeather = function(nodeId) {
		$.getJSON('/solarquery/currentWeather.json?nodeId=' + nodeId, function(data) {
			mpcConsole.debug('Retrieved weather for node ' + nodeId);
			mpcConsole.loadWeather(data.weather, data.day);
		});
	};
	
	/**
	 * Loads the json from weatherData.json into the console.
	 */
	this.loadWeather = function(weatherData, dayData) {
		if (weatherData) {
			mpcConsole.debug('Current temp: ' + weatherData.temperatureCelcius);
			$('#current_temp').html(weatherData.temperatureCelcius);
		}
		
		if (dayData.condition) {
			mpcConsole.debug('Current condition: ' + dayData.condition);
			mpcConsole.loadWeatherIcon(dayData.condition, $('.weather_icon'));
		}
	};
	
	/**
	 * Given a weather condition loads the icon into the specified div.
	 */
	this.loadWeatherIcon = function (condition, iconDiv) {
		var iconName = mpcConsole.getWeatherIconNameFromCondition(condition);
		if (conditionCache[iconName] ) {
			iconDiv.html(conditionCache[iconName].cloneNode(true)).show();
			return;
		}
		
		$.ajax({
			type: 'GET',
			url: 'images/weather/weather-' +iconName +'.svg',
			dataType: 'xml',
			success: function(data, textStatus) {
				var svg = document.importNode(data.documentElement, true);
				conditionCache[iconName] = svg;
				iconDiv.html(svg).show();
			}
		});
	};
	
	/**
	 * Given a weather condition gets the name of the icon to be used.
	 */
	this.getWeatherIconNameFromCondition = function(condition) {
		// convert camel-caps into dash delimited icon name
		var iconName = condition.charAt(0).toLowerCase() 
			+ condition.substring(1);
		var idx = -1;
		while ( (idx = iconName.search(/[A-Z]/)) != -1 ) {
			iconName = iconName.substring(0, idx)
				+ '-' + iconName.charAt(idx).toLowerCase()
				+ iconName.substring(idx+1);
		}
		return iconName;
	};
	
	this.displayEnvironmentalEffect = function() {
		if (pvOn) {
			mpcConsole.debug('PV unit is currently generating');
		} else {
			mpcConsole.debug('PV unit is not currently generating');
			$('#dashboard_solar').attr('class', 'dashboard_solar_off');
			$('#dashboard_pv_wires').attr('class', 'dashboard_pv_wires_default');
		}
		
		if (mpcConsole.isEnvironmentalEffectPositive()) {
			mpcConsole.debug('Environmental Effect: Positive');

			// Update PV if required
			if (pvOn) {
				if ($('#dashboard_solar').attr('class') != 'dashboard_solar_positive') {
					$('#dashboard_solar').switchClass($('#dashboard_solar').attr('class'), 'dashboard_solar_positive', 'slow');
					$('#dashboard_pv_wires').switchClass($('#dashboard_pv_wires').attr('class'), 'dashboard_pv_wires_positive', 'slow');
				}
			}

			// Only continue if state has change
			if (currentEffect == 'positive') {
				return;
			} else {
				currentEffect = 'positive';
			}
			
			$('#dashboard_savings').switchClass($('#dashboard_savings').attr('class'), 'dashboard_savings_positive', 'slow');
			$('#dashboard_battery').switchClass($('#dashboard_battery').attr('class'), 'battery_positive_100', 'slow');
			$('#dashboard_wires').switchClass($('#dashboard_wires').attr('class'), 'dashboard_wires_positive', 'slow');
			$('#dashboard_grid').switchClass($('#dashboard_grid').attr('class'), 'dashboard_grid_positive', 'slow');
			
			$('#footer').hide();
			$('#footer').switchClass($('#footer').attr('class'), 'footer_forest', 'slow');
			$('#footer').show('fade', {}, 'slow');
			
			$('#footer_message').hide();
			$('#footer_env_effect').html('positive');
			$('#footer_message').attr('class', 'footer_message_positive');
			$('#footer_message').show('slide', {direction: 'down'}, 'slow');
		} else {
			mpcConsole.debug('Environmental Effect: Negative');
			
			// Update PV if required
			if (pvOn) {
				if ($('#dashboard_solar').attr('class') != 'dashboard_solar_negative') {
					$('#dashboard_solar').switchClass($('#dashboard_solar').attr('class'), 'dashboard_solar_negative', 'slow');
					$('#dashboard_pv_wires').switchClass($('#dashboard_pv_wires').attr('class'), 'dashboard_pv_wires_negative', 'slow');
				}
			}
			
			// Only continue if state has change
			if (currentEffect == 'negative') {
				return;
			} else {
				currentEffect = 'negative';
			}
			
			$('#dashboard_savings').switchClass($('#dashboard_savings').attr('class'), 'dashboard_savings_negative', 'slow');
			$('#dashboard_battery').switchClass($('#dashboard_battery').attr('class'), 'battery_negative_100', 'slow');
			$('#dashboard_wires').switchClass($('#dashboard_wires').attr('class'), 'dashboard_wires_negative', 'slow');
			$('#dashboard_grid').switchClass($('#dashboard_grid').attr('class'), 'dashboard_grid_negative', 'slow');
			
			$('#footer').hide();
			$('#footer').switchClass($('#footer').attr('class'), 'footer_desert', 'slow');
			$('#footer').show('fade', {}, 'slow');
			
			$('#footer_message').hide();
			$('#footer_env_effect').html('negative');
			$('#footer_message').attr('class', 'footer_message_negative');
			$('#footer_message').show('slide', {direction: 'down'}, 'slow');
		}
	};

	/**
	 * Determines if the environmental effect of the current user is considered positive or not.
	 */
	this.isEnvironmentalEffectPositive = function() {
		return intervalWattHours > 0;
	};
	
	this.test = function(nodeId) {
		var testStates = [];
		testStates[0] = function(){
			mpcConsole.debug('************************* hours +, pv on');
			debugIntervalWattHours = 27345;
			debugPvWatts = 45;
			mpcConsole.populateConsole(nodeId);};
		testStates[1] = function(){
				mpcConsole.debug('************************* hours +, pv off');
				debugIntervalWattHours = 23005;
				debugPvWatts = 0;
				mpcConsole.populateConsole(nodeId);};
		testStates[2] = function(){
			mpcConsole.debug('************************* hours 0, pv off');
			debugIntervalWattHours = 0;
			debugPvWatts = 0;
			mpcConsole.populateConsole(nodeId);};
		testStates[3] = function(){
			mpcConsole.debug('************************* hours 0, pv on');
			debugIntervalWattHours = 0;
			debugPvWatts = 63;
			mpcConsole.populateConsole(nodeId);};
		
		setInterval(function(){
			var testIdx = (Math.floor(Math.random()*1000))%4;
			console.log("Running test state: " + testIdx);
			testStates[testIdx]();
		}, 20000);
		
	};
}

function toggleFriendsBar() {
	$('#friends_button').toggle('slide');
	$('#friends_bar').toggle('slide');
	$('#friends_overlay').toggle('slide');
}

function changeFriend(div) {

	$('#friends_overlay').hide();// hiding the overlay apparently makes it slide back across which is the desired effect
	
	var friendIdx = div.attr('id');
	console.log('friendIdx='+friendIdx);
	$('#friends_overlay').toggle('slide');
	if (friendIdx == 'friends_avatar_1') {
		$('#friends_bar').css('background-position', '0px -10px');
		$('.friends_overlay_avatar').css('background-image', "url('images/friends/House-A-Icon.png')");
	} else if (friendIdx == 'friends_avatar_2') {
		$('#friends_bar').css('background-position', '0px -88px');
		$('.friends_overlay_avatar').css('background-image', "url('images/friends/House-B-Icon.png')");
	} else if (friendIdx == 'friends_avatar_3') {
		$('#friends_bar').css('background-position', '0px -166px');
		$('.friends_overlay_avatar').css('background-image', "url('images/friends/House-C-Icon.png')");
	} else if (friendIdx == 'friends_avatar_4') {
		$('#friends_bar').css('background-position', '0px -244px');
		$('.friends_overlay_avatar').css('background-image', "url('images/friends/House-D-Icon.png')");
	} else if (friendIdx == 'friends_avatar_5') {
		$('#friends_bar').css('background-position', '0px -322px');
		$('.friends_overlay_avatar').css('background-image', "url('images/friends/House-E-Icon.png')");
	} else if (friendIdx == 'friends_avatar_6') {
		$('#friends_bar').css('background-position', '0px -400px');
		$('.friends_overlay_avatar').css('background-image', "url('images/friends/House-F-Icon.png')");
	} else if (friendIdx == 'friends_avatar_7') {
		$('#friends_bar').css('background-position', '0px -478px');
		$('.friends_overlay_avatar').css('background-image', "url('images/friends/House-G-Icon.png')");
	}
}
