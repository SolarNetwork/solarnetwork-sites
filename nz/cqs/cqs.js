/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-energy-io 1.0.0
 * @require solarnetwork-d3-chart-power-io 1.0.0
 */

sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

//adjust display units as needed (between W and kW, etc)
function adjustChartDisplayUnits(chartKey, baseUnit, scale) {
	var unit = (scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
	d3.selectAll(chartKey +' .unit').text(unit);
}

// handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	if ( sn.runtime.energyBarChart !== undefined ) {
		// use a slight delay, otherwise transitions can be jittery
		setTimeout(function() {
			sn.runtime.energyBarChart.regenerate();
			adjustChartDisplayUnits('.watthour-chart', 'Wh', sn.runtime.energyBarChart.yScale());
		}, sn.runtime.energyBarChart.transitionMs() * 0.5);
	}
	if ( sn.runtime.powerAreaChart !== undefined ) {
		// use a slight delay, otherwise transitions can be jittery
		setTimeout(function() {
			sn.runtime.powerAreaChart.regenerate();
			adjustChartDisplayUnits('.watt-chart', 'W', sn.runtime.powerAreaChart.yScale());
		}, sn.runtime.powerAreaChart.transitionMs() * 0.5);
	}
	if ( sn.runtime.overviewAreaChart !== undefined ) {
		// use a slight delay, otherwise transitions can be jittery
		setTimeout(function() {
			sn.runtime.overviewAreaChart.regenerate();
			adjustChartDisplayUnits('.overview-chart', 'Wh', sn.runtime.overviewAreaChart.yScale());
		}, sn.runtime.overviewAreaChart.transitionMs() * 0.5);
	}
}

//Watt hour stacked bar chart
function wattHourChartSetup(endDate, sourceMap) {
	var end;
	var start;
	var timeCount;
	var timeUnit;
	// for aggregate time ranges, the 'end' date in inclusive
	if ( sn.runtime.energyBarParameters.aggregate === 'Month' ) {
		timeCount = (sn.env.numYears || 1);
		timeUnit = 'year';
		end = d3.time.month.utc.floor(endDate);
		start = d3.time.year.utc.offset(end, -timeCount);
	} else if ( sn.runtime.energyBarParameters.aggregate === 'Day' ) {
		timeCount = (sn.env.numMonths || 4);
		timeUnit = 'month';
		end = d3.time.day.utc.floor(endDate);
		start = d3.time.month.utc.offset(end, -timeCount);
	} else {
		// assume Hour
		timeCount = (sn.env.numDays || 7);
		timeUnit = 'day';
		end = d3.time.hour.utc.floor(endDate);
		start = d3.time.day.utc.offset(end, -timeCount);
	}
	
	d3.select('.watthour-chart .time-count').text(timeCount);
	d3.select('.watthour-chart .time-unit').text(timeUnit);
	
	var q = queue();
	sn.env.dataTypes.forEach(function(e, i) {
		var urlHelper = (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
		q.defer(d3.json, urlHelper.dateTimeQuery(e, start, end, sn.runtime.energyBarParameters.aggregate));
	});
	q.awaitAll(function(error, results) {
		if ( error ) {
			sn.log('Error requesting data: ' +error);
			return;
		}
		var combinedData = [];
		var i, iMax, j, jMax, json, datum, mappedSourceId;
		for ( i = 0, iMax = results.length; i < iMax; i++ ) {
			json = results[i];
			if ( json.success !== true || Array.isArray(json.data) !== true ) {
				sn.log('No data available for node {0} data type {1}', sn.runtime.urlHelper.nodeId(), sn.env.dataTypes[i]);
				return;
			}
			for ( j = 0, jMax = json.data.length; j < jMax; j++ ) {
				datum = json.data[j];
				mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[sn.env.dataTypes[i]][datum.sourceId];
				if ( mappedSourceId !== undefined ) {
					datum.sourceId = mappedSourceId;
				}
			}
			combinedData = combinedData.concat(json.data);
		}
		sn.runtime.energyBarChart.consumptionSourceCount(sourceMap[sn.env.dataTypes[0]].length);
		sn.runtime.energyBarChart.load(combinedData, {
			aggregate : sn.runtime.energyBarParameters.aggregate
		});
		sn.log("Energy IO chart watt hour range: {0}", sn.runtime.energyBarChart.yDomain());
		sn.log("Energy IO chart time range: {0}", sn.runtime.energyBarChart.xDomain());
		adjustChartDisplayUnits('.watthour-chart', 'Wh', sn.runtime.energyBarChart.yScale());
	});
}

//Watt stacked area chart
function wattChartSetup(endDate, sourceMap) {
	var precision = (sn.env.minutePrecision || 10);
	var timeCount = (sn.env.numHours || 24);
	var timeUnit = 'hour';
	var end = d3.time.minute.utc.ceil(endDate);
	end.setUTCMinutes((end.getUTCMinutes() + precision - (end.getUTCMinutes() % precision)), 0, 0);
	var start = d3.time.hour.utc.offset(end, -timeCount);
	
	d3.select('.watt-chart .time-count').text(timeCount);
	d3.select('.watt-chart .time-unit').text(timeUnit);
	
	var q = queue();
	sn.env.dataTypes.forEach(function(e, i) {
		var urlHelper = (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
		q.defer(d3.json, urlHelper.dateTimeQuery(e, start, end, sn.env.minutePrecision));
	});
	q.awaitAll(function(error, results) {
		if ( error ) {
			sn.log('Error requesting data: ' +error);
			return;
		}
		var combinedData = [];
		var i, iMax, j, jMax, json, datum, mappedSourceId;
		for ( i = 0, iMax = results.length; i < iMax; i++ ) {
			json = results[i];
			if ( json.success !== true || Array.isArray(json.data) !== true ) {
				sn.log('No data available for node {0} data type {1}', sn.runtime.urlHelper.nodeId(), sn.env.dataTypes[i]);
				return;
			}
			for ( j = 0, jMax = json.data.length; j < jMax; j++ ) {
				datum = json.data[j];
				mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[sn.env.dataTypes[i]][datum.sourceId];
				if ( mappedSourceId !== undefined ) {
					datum.sourceId = mappedSourceId;
				}
			}
			combinedData = combinedData.concat(json.data);
		}
		sn.runtime.powerAreaChart.consumptionSourceCount(sourceMap[sn.env.dataTypes[0]].length);
		sn.runtime.powerAreaChart.load(combinedData);
		sn.log("Power IO chart watt range: {0}", sn.runtime.powerAreaChart.yDomain());
		sn.log("Power IO chart time range: {0}", sn.runtime.powerAreaChart.xDomain());
		adjustChartDisplayUnits('.watt-chart', 'W', sn.runtime.powerAreaChart.yScale());
	});
}

//seasonal hour-of-day line chart
function seasonalHourOfDayChartSetup(sourceMap) {
	var q = queue();
	sn.env.dataTypes.forEach(function(e, i) {
		var urlHelper = (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
		q.defer(d3.json, urlHelper.dateTimeList(e, null, null, 'SeasonalHourOfDay'));
	});
	q.awaitAll(function(error, results) {
		if ( error ) {
			sn.log('Error requesting data: ' +error);
			return;
		}
		var combinedData = [];
		var i, iMax, j, jMax, json, datum, mappedSourceId;
		for ( i = 0, iMax = results.length; i < iMax; i++ ) {
			json = results[i];
			if ( json.success !== true || json.data === undefined || Array.isArray(json.data.results) !== true ) {
				sn.log('No data available for node {0} data type {1}', urlHelperForAvailbleDataRange(null, i).nodeId(), sn.env.dataTypes[i]);
				return;
			}
			for ( j = 0, jMax = json.data.results.length; j < jMax; j++ ) {
				datum = json.data.results[j];
				mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[sn.env.dataTypes[i]][datum.sourceId];
				if ( mappedSourceId !== undefined ) {
					datum.sourceId = mappedSourceId;
				}
			}
			combinedData = combinedData.concat(json.data.results);
		}
		
		sn.runtime.seasonalHourOfDayChart.consumptionSourceCount(sourceMap[sn.env.dataTypes[0]].length);
		sn.runtime.seasonalHourOfDayChart.load(combinedData, sn.runtime.seasonalHourOfDayParameters);
		sn.log("Seasonal HOD IO chart watt hour range: {0}", sn.runtime.seasonalHourOfDayChart.yDomain());
		sn.log("Seasonal HOD IO chart time range: {0}", sn.runtime.seasonalHourOfDayChart.xDomain());
		adjustChartDisplayUnits('.seasonal-hod-chart', 'Wh', sn.runtime.seasonalHourOfDayChart.yScale());
	});
}

// Wh stacked area chart over whole range
function overviewAreaChartSetup(reportableInterval, sourceMap) {
	var end = reportableInterval.eLocalDate;
	var start = reportableInterval.sLocalDate;
	var precision = (sn.env.minutePrecision || 10);
	
	var q = queue();
	sn.env.dataTypes.forEach(function(e, i) {
		var urlHelper = (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
		q.defer(d3.json, urlHelper.dateTimeQuery(e, start, end, 
				(sn.runtime.overviewAreaParameters.aggregate === 'Minute' 
					? precision
					: sn.runtime.overviewAreaParameters.aggregate)));
	});
	q.awaitAll(function(error, results) {
		if ( error ) {
			sn.log('Error requesting data: ' +error);
			return;
		}
		var combinedData = [];
		var i, iMax, j, jMax, json, datum, mappedSourceId;
		for ( i = 0, iMax = results.length; i < iMax; i++ ) {
			json = results[i];
			if ( json.success !== true || Array.isArray(json.data) !== true ) {
				sn.log('No data available for node {0} data type {1}', sn.runtime.urlHelper.nodeId(), sn.env.dataTypes[i]);
				return;
			}
			for ( j = 0, jMax = json.data.length; j < jMax; j++ ) {
				datum = json.data[j];
				mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[sn.env.dataTypes[i]][datum.sourceId];
				if ( mappedSourceId !== undefined ) {
					datum.sourceId = mappedSourceId;
				}
			}
			combinedData = combinedData.concat(json.data);
		}
		sn.runtime.overviewAreaChart.load(combinedData);
		sn.log("Overview chart Wh range: {0}", sn.runtime.overviewAreaChart.yDomain());
		sn.log("Overview chart time range: {0}", sn.runtime.overviewAreaChart.xDomain());
		adjustChartDisplayUnits('.overview-chart', 'Wh', sn.runtime.overviewAreaChart.yScale());
	});
}

function setup(repInterval, sourceMap) {
	sn.runtime.reportableEndDate = repInterval.eLocalDate;
	sn.runtime.sourceMap = sourceMap;
	sn.runtime.sourceColorMap = sn.sourceColorMapping(sourceMap);
	
	// we make use of sn.colorFn, so stash the required color map where expected
	sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

	// set up form-based details
	d3.select('#details .consumption').style('color', 
			sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Consumption'][sourceMap['Consumption'][0]]]);
	d3.select('#details .generation').style('color', 
			sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Power'][sourceMap['Power'][0]]]);

	// create copy of color data for reverse ordering so labels vertically match chart layers
	sn.colorDataLegendTable('#source-labels', sn.runtime.sourceColorMap.colorMap.slice().reverse(), legendClickHandler, function(s) {
		if ( sn.env.linkOld === 'true' ) {
			s.html(function(d) {
				return '<a href="' +sn.runtime.urlHelper.nodeDashboard(d) +'">' +d +'</a>';
			});
		} else {
			s.text(Object);
		}
	});

	// pass our source mapping to the seasonal chart, to know what source IDs are consumption vs generation
	var dataType = undefined;
	var sourceId = undefined;
	var sourceIdLayerNameMap = {};
	for ( dataType in sn.runtime.sourceColorMap.displaySourceMap ) {
		sourceIdLayerNameMap[dataType] = {};
		for ( sourceId in sn.runtime.sourceColorMap.displaySourceMap[dataType] ) {
			sourceIdLayerNameMap[sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId]] = dataType;
		}
	}
	sn.runtime.seasonalHourOfDayChart.sourceIdLayerNameMap(sourceIdLayerNameMap);

	overviewAreaChartSetup(repInterval, sn.runtime.sourceMap);

	wattChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
	wattHourChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
	seasonalHourOfDayChartSetup(sn.runtime.sourceMap);
}

function updateReadings() {
	d3.json(sn.runtime.urlHelper.mostRecentQuery('Power'), function(json) {
		if ( json.data === undefined ) {
			sn.log('No data available for node {0}', sn.runtime.urlHelper.nodeId());
			return;
		}
		// totalPower, in kW
		var totalPower = d3.sum(json.data, function(d) { return d.watts; }) / 1000;
		sn.runtime.totalPowerGauge.update(totalPower);
		d3.select('#total-power-value').html(Number(totalPower).toFixed(2));
	});
}

function swapChart(direction) {
	if ( d3.select('.watthour-chart').classed('chart-in') ) {
		// swap visible aggregate level... until we've cycled through them all
		if ( direction !== undefined && direction < 0 ) {
			sn.runtime.energyBarParameters.aggregate = (sn.runtime.energyBarParameters.aggregate === 'Hour' 
				? 'Month' : sn.runtime.energyBarParameters.aggregate === 'Month' ? 'Day' : 'Hour');
		} else {
			sn.runtime.energyBarParameters.aggregate = (sn.runtime.energyBarParameters.aggregate === 'Hour' 
				? 'Day' : sn.runtime.energyBarParameters.aggregate === 'Day' ? 'Month' : 'Hour');
		}
		if ( sn.runtime.energyBarParameters.aggregate === 'Hour' ) {
			// we'll swap to W chart now, but switch this back to Hour for next time it appears
			setTimeout(function() {
				wattHourChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
				setupActionStates();
			}, 3000);
		} else {
			wattHourChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
			setupActionStates();
			return;
		}
	}
	var currIn = undefined;
	var charts = d3.selectAll('.charts > .chart');
	charts.each(function(d, i) {
		var chart = d3.select(this);
		var currOut =  (chart.classed('chart-out') || chart.classed('chart-waiting'));
		if ( !currOut && currIn === undefined ) {
			currIn = i;
		}
	});
	var nextIn = ((currIn + (direction !== undefined && direction < 0 ? (charts.size() - 1) : 1)) % charts.size());
	charts.each(function(d, i) {
		var chart = d3.select(this);
		if ( i === currIn ) {
			chart.classed({'chart-out':true, 'chart-in':false, 'chart-waiting':false});
		} else if ( i === nextIn ) {
			chart.style('opacity', 1e-6)
				.classed({'chart-out':false, 'chart-in':true, 'chart-waiting':false})
			.transition().duration(200)
				.style('opacity', 1);
		}
	});
}

function isAutomaticSwapChartEnabled() {
	return (sn.runtime.swapChartTimer !== undefined);
}

function enableAutomaticSwapChart() {
	if ( sn.runtime.swapChartTimer !== undefined ) {
		return;
	}
	sn.runtime.swapChartTimer = setInterval(swapChart,  sn.env.swapSeconds * 1000);
}

function disableAutomaticSwapChart() {
	if ( sn.runtime.swapChartTimer === undefined ) {
		return;
	}
	clearInterval(sn.runtime.swapChartTimer);
	delete sn.runtime.swapChartTimer;
}

function resetAutomaticSwapChart() {
	disableAutomaticSwapChart();
	enableAutomaticSwapChart();
}

function actionToggleAutomaticSwapChart() {
	var me = d3.select(this);
	var currEnabled = isAutomaticSwapChartEnabled();
	me.classed({'fa-pause' : !currEnabled, 'fa-play' : currEnabled});
	if ( currEnabled ) {
		disableAutomaticSwapChart();
	} else {
		enableAutomaticSwapChart();
	}
}

function resizeProps(parent) {
	var chartEl = undefined;
	while ( parent.parentNode ) {
		parent = parent.parentNode;
		chartEl = d3.select(parent);
		if ( chartEl.classed('chart') ) {
			break;
		}
	}
	if ( chartEl === undefined ) {
		return;
	}
	var chart;
	var min, max;
	var propName;
	if ( chartEl.classed('watt-chart') ) {
		chart = sn.runtime.powerAreaChart;
		propName = 'numHours';
		min = 1;
		max = 36;
	} else {
		// assume Wh chart
		chart = sn.runtime.energyBarChart;
		if ( sn.runtime.energyBarParameters.aggregate === 'Month' ) {
			propName = 'numYears';
			min = 1;
			max = 6;
		} else if ( sn.runtime.energyBarParameters.aggregate === 'Day' ) {
			propName = 'numMonths';
			min = 1;
			max = 8;
		} else {
			// assume Hour
			propName = 'numDays';
			min = 1;
			max = 10;
		}
	}
	return {chart:chart, propName:propName, min:min, max:max};
}

function actionDecrease() {
	resetAutomaticSwapChart();
	var props = resizeProps(this);
	var currVal = sn.env[props.propName];
	if ( currVal <= props.min ) {
		return;
	}
	var newVal = (currVal - 1);
	sn.env[props.propName] = newVal;
	setupActionStates();
	if ( props.chart === sn.runtime.powerAreaChart ) {
		wattChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
	} else {
		wattHourChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
	}
}

function actionIncrease() {
	resetAutomaticSwapChart();
	var props = resizeProps(this);
	var currVal = sn.env[props.propName];
	if ( currVal >= props.max ) {
		return;
	}
	var newVal = (currVal + 1);
	sn.env[props.propName] = newVal;
	setupActionStates();
	if ( props.chart === sn.runtime.powerAreaChart ) {
		wattChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
	} else {
		wattHourChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
	}
}

function setupActionStates() {
	d3.selectAll('.charts .decrease').classed('disabled', function() {
		var props = resizeProps(this);
		var currVal = sn.env[props.propName];
		return (currVal === props.min);
	});
	d3.selectAll('.charts .increase').classed('disabled', function() {
		var props = resizeProps(this);
		var currVal = sn.env[props.propName];
		return (currVal === props.max);
	});
}

function actionToggleSumline() {
	resetAutomaticSwapChart();
	var me = d3.select(this);
	var off = me.classed('disabled');
	me.classed('disabled', !off);
	sn.runtime.energyBarChart.showSumLine(off);
}

function setupUI() {
	// setup power gauge
	sn.runtime.totalPowerGauge = sn.chart.gauge('#total-power-gauge', {
		size: 182,
		clipWidth: 182,
		clipHeight: 110,
		ringWidth: 30,
		maxValue: sn.env.maxPowerKW,
		majorTicks: sn.env.powerGaugeTicks,
		transitionMs: 4000,
		flipCounterAnimate: 'true'
	});
	sn.runtime.totalPowerGauge.render();

	// every minute update reading values
	updateReadings();
	setInterval(updateReadings, 60 * 1000);
	
	// flip counter for Wh generated
	sn.runtime.flipCounterKWh = sn.ui.flipCounter('#counter-kwh', {
		animate: (sn.env.flipCounterAnimate === 'true'),
		format: d3.format(',d'),
		flipperWidth: 21
	});
	sn.runtime.flipCounterKWh.render();

	// flip counter for Wh consumed
	sn.runtime.flipCounterKWhConsumed = sn.ui.flipCounter('#counter-kwh-consume', {
		animate: (sn.env.flipCounterAnimate === 'true'),
		format: d3.format(',d'),
		flipperWidth: 21
	});
	sn.runtime.flipCounterKWhConsumed.render();

	// decrease/increase date ranges
	d3.selectAll('.charts .decrease').classed('clickable', true).on('click', actionDecrease);
	d3.selectAll('.charts .increase').classed('clickable', true).on('click', actionIncrease);
	setupActionStates();
	
	// toggle sum lines on/off
	d3.select('.charts .toggle-sumline').classed('clickable', true).on('click', actionToggleSumline);
	
	// animate between charts every few seconds
	enableAutomaticSwapChart();
	
	// toggle auto-swap on/off
	d3.select('.actions .toggle-chartswap').classed('clickable', true).on('click', actionToggleAutomaticSwapChart);

	// allow space key to toggle animations on/off
	d3.select("body").on("keydown", function(event) {
		if ( d3.event.keyCode === 32 ) {
			// spacebar
			actionToggleAutomaticSwapChart.call(d3.select('.actions .toggle-chartswap').node());
		} else if ( d3.event.keyCode === 37 ) {
			// left arrow, go to previous chart
			swapChart(-1);
			if ( isAutomaticSwapChartEnabled() ) {
				resetAutomaticSwapChart();
			}
		} else if ( d3.event.keyCode === 39 ) {
			// right arrow, go to next chart
			swapChart();
			if ( isAutomaticSwapChartEnabled() ) {
				resetAutomaticSwapChart();
			}
		}
	});
}

function setupCounters(repInterval) {
	// Wh counter utility (generation)
	if ( sn.runtime.wattHourPowerCounter === undefined ) {
		sn.runtime.wattHourPowerCounter = sn.util.aggregateCounter({
			dataType: 'Power',
			nodeUrlHelper: sn.runtime.urlHelper,
			startingInterval: {startDate: repInterval.sLocalDate, endDate: repInterval.eLocalDate},
			callback : function() {
				var totalKWattHours = this.aggregateValue() / 1000;
				
				// using conversion of  0.7685 kg CO2/kWh electricity
				var totalCO2Kg = Math.round(totalKWattHours * Number(sn.env.CO2Factor));
				
				var totalDollars = Math.round(totalKWattHours * Number(sn.env.KWhTarrif));
				
				sn.log('{0} total kWh calculated as {1} Kg CO2; ${2}', 
					totalKWattHours, totalCO2Kg, totalDollars);
				sn.runtime.flipCounterKWh.update(Math.round(totalKWattHours));
				//sn.runtime.flipCounterCO2.update(totalCO2Kg);
				//sn.runtime.flipCounterMoney.update(totalDollars);
			}
		});
		sn.runtime.wattHourPowerCounter.start();
	}

	// Wh counter utility (consumption)
	if ( sn.runtime.wattHourConsumptionCounter === undefined ) {
		sn.runtime.wattHourConsumptionCounter = sn.util.aggregateCounter({
			dataType: 'Consumption',
			nodeUrlHelper: sn.runtime.consumptionUrlHelper,
			startingInterval: {startDate: repInterval.sLocalDate, endDate: repInterval.eLocalDate},
			callback : function() {
				var totalKWattHours = this.aggregateValue() / 1000;
				sn.runtime.flipCounterKWhConsumed.update(Math.round(totalKWattHours));
			}
		});
		sn.runtime.wattHourConsumptionCounter.start();
	}
}

function urlHelperForAvailbleDataRange(e, i) {
	if ( !arguments.length ) return sn.runtime.urlHelper;
	return (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 108,
		consumptionNodeId : 108,
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		numMonths : 4,
		numYears : 1,
		wiggle : 'true',
		linkOld : 'false',
		maxPowerKW : 8,
		powerGaugeTicks : 8,
		swapSeconds : 20,
		northernHemisphere : 'false',
		dataTypes: ['Consumption', 'Power']
	});
	sn.runtime.refreshMs = sn.env.minutePrecision * 60 * 1000;

	sn.runtime.overviewAreaParameters = new sn.Configuration({
		height: 80,
		padding : [0, 0, 15, 0],
		excludeSources: sn.runtime.excludeSources,
		aggregate : 'Month',
		wiggle : (sn.env.wiggle === 'true'),
		plotProperties : {Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.overviewAreaChart = sn.chart.powerAreaChart('#overview-chart', sn.runtime.overviewAreaParameters);
	
	var mainChartHeight = 460;
	
	sn.runtime.energyBarParameters = new sn.Configuration({
		height : mainChartHeight,
		aggregate : 'Hour',
		excludeSources : sn.runtime.excludeSources,
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false)
	});
	sn.runtime.energyBarChart = sn.chart.energyIOBarChart('#watthour-chart', sn.runtime.energyBarParameters);

	sn.runtime.powerAreaParameters = new sn.Configuration({
		height : mainChartHeight,
		excludeSources: sn.runtime.excludeSources
	});
	sn.runtime.powerAreaChart = sn.chart.powerIOAreaChart('#watt-chart', sn.runtime.powerAreaParameters);

	sn.runtime.seasonalHourOfDayParameters = new sn.Configuration({
		height : mainChartHeight,
		excludeSources : sn.runtime.excludeSources,
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false)
	});

	sn.runtime.seasonalHourOfDayChart = sn.chart.seasonalHourOfDayLineChart('#seasonal-hod-chart', sn.runtime.seasonalHourOfDayParameters);

	// find our available data range, and then draw our charts!
	function handleAvailableDataRange(event) {
		setup(event.data.reportableInterval, event.data.availableSourcesMap);
		setupCounters(event.data.reportableInterval);
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				sn.availableDataRange(urlHelperForAvailbleDataRange, sn.env.dataTypes, function(data) {
					var jsonEndDate = data.reportableInterval.eLocalDate;
					if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
						if ( sn.runtime.powerAreaChart !== undefined ) {
							wattChartSetup(jsonEndDate, sn.runtime.sourceMap);
						}
						if ( sn.runtime.energyBarChart !== undefined ) {
							wattHourChartSetup(jsonEndDate, sn.runtime.sourceMap);
						}
						if ( sn.runtime.overviewAreaChart !== undefined ) {
							overviewAreaChartSetup(data.reportableInterval, sn.runtime.sourceMap);
						}
						if ( sn.runtime.seasonalHourOfDayChart !== undefined ) {
							seasonalHourOfDayChartSetup(sn.runtime.sourceMap);
						}
					}
				});
			}, sn.runtime.refreshMs);
		}
	}
	document.addEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.nodeUrlHelper(sn.env.consumptionNodeId);
	sn.availableDataRange(urlHelperForAvailbleDataRange, sn.env.dataTypes);

	setupUI();
}
