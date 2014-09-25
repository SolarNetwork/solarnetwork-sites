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

function colorForDataTypeSource(dataType, sourceId, sourceIndex) {
	if ( sn.env.showSources === 'true' ) {
		var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
		return sn.runtime.colorData[mappedSourceId];
	}
	return sn.runtime.sourceColorMap.colorMap[sourceId];
}

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId;
	if ( sn.env.showSources === 'true' ) {
		mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	} else {
		mappedSourceId = displayNameForDataType(dataType);
	}
	return (sourceId !== sn.env.pcmSourceId && sn.runtime.excludeSources.enabled(mappedSourceId));
}

function displayNameForDataType(dataType) {
	if ( sn.env.showSources === 'true' ) {
		return dataType;
	}
	return (dataType === 'Generation' ? 'Solar' : dataType);
}

function layerPostProcessCallback(dataType, layerData) {
	if ( sn.env.showSources === 'true' ) {
		return layerData;
	}
	return sn.aggregateNestedDataLayers(layerData, dataType, ['date', '__internal__'], ['watts', 'wattHours'], 
		{sourceId : displayNameForDataType(dataType)});
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
				mappedSourceId = mappedSourceIdForDataType(i, datum.sourceId);
				if ( mappedSourceId !== undefined ) {
					datum.sourceId = mappedSourceId;
				}
			}
			combinedData = combinedData.concat(json.data);
		}
		sn.runtime.energyBarChart.consumptionSourceCount(consumptionSourceCount(sourceMap));
		sn.runtime.energyBarChart.load(combinedData, {
			aggregate : sn.runtime.energyBarParameters.aggregate
		});
		sn.log("Energy IO chart watt hour range: {0}", sn.runtime.energyBarChart.yDomain());
		sn.log("Energy IO chart time range: {0}", sn.runtime.energyBarChart.xDomain());
		adjustChartDisplayUnits('.watthour-chart', 'Wh', sn.runtime.energyBarChart.yScale());
	});
}

function consumptionSourceCount(sourceMap) {
	var array = sourceMap[sn.env.dataTypes[0]];
	return ( array !== undefined ? array.length : 0);
}

function mappedSourceIdForDataType(i, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[sn.env.dataTypes[i]];
	if ( mappedSourceId !== undefined ) {
		mappedSourceId = mappedSourceId[sourceId];
	}
	return mappedSourceId;
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
				mappedSourceId = mappedSourceIdForDataType(i, datum.sourceId);
				if ( mappedSourceId !== undefined ) {
					datum.sourceId = mappedSourceId;
				}
			}
			combinedData = combinedData.concat(json.data);
		}
		sn.runtime.powerAreaChart.consumptionSourceCount(consumptionSourceCount(sourceMap));
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
				mappedSourceId = mappedSourceIdForDataType(i, datum.sourceId);
				if ( mappedSourceId !== undefined ) {
					datum.sourceId = mappedSourceId;
				}
			}
			combinedData = combinedData.concat(json.data.results);
		}
		
		sn.runtime.seasonalHourOfDayChart.load(combinedData, sn.runtime.seasonalHourOfDayParameters);
		sn.log("Seasonal HOD IO chart watt hour range: {0}", sn.runtime.seasonalHourOfDayChart.yDomain());
		sn.log("Seasonal HOD IO chart time range: {0}", sn.runtime.seasonalHourOfDayChart.xDomain());
		adjustChartDisplayUnits('.seasonal-hod-chart', 'Wh', sn.runtime.seasonalHourOfDayChart.yScale());
	});
}

//seasonal day of week line chart
function seasonalDayOfWeekChartSetup(sourceMap) {
	var q = queue();
	sn.env.dataTypes.forEach(function(e, i) {
		var urlHelper = (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
		q.defer(d3.json, urlHelper.dateTimeList(e, null, null, 'SeasonalDayOfWeek'));
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
				mappedSourceId = mappedSourceIdForDataType(i, datum.sourceId);
				if ( mappedSourceId !== undefined ) {
					datum.sourceId = mappedSourceId;
				}
			}
			combinedData = combinedData.concat(json.data.results);
		}
		
		sn.runtime.seasonalDayOfWeekChart.load(combinedData, sn.runtime.seasonalDayOfWeekParameters);
		sn.log("Seasonal DOW IO chart watt hour range: {0}", sn.runtime.seasonalDayOfWeekChart.yDomain());
		sn.log("Seasonal DOW IO chart time range: {0}", sn.runtime.seasonalDayOfWeekChart.xDomain());
		adjustChartDisplayUnits('.seasonal-dow-chart', 'Wh', sn.runtime.seasonalDayOfWeekChart.yScale());
	});
}

// Wh stacked area chart over whole range
function overviewAreaChartSetup(container, chart, parameters, endDate, sourceMap) {
	var queryRange = sn.datum.loaderQueryRange(parameters.aggregate, sn.env, endDate);
	var plotPropName = parameters.plotProperties[parameters.aggregate];
	
	container.selectAll('.time-count').text(queryRange.timeCount);
	container.selectAll('.time-unit').text(queryRange.timeUnit);
	
	sn.datum.multiLoader([
		sn.datum.loader(sourceMap['Consumption'], sn.runtime.consumptionUrlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate),
		sn.datum.loader(sourceMap['Generation'], sn.runtime.urlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate)
	]).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 2) ) {
			sn.log("Unable to load data for Power Area chart: {0}", error);
			return;
		}
		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		chart.reset()
			.load(results[0], 'Consumption')
			.load(results[1], 'Generation')
			.regenerate();
		sn.log("Power Area chart watt range: {0}", chart.yDomain());
		sn.log("Power Area chart time range: {0}", chart.xDomain());
		sn.adjustDisplayUnits(container, (parameters.aggregate === 'TenMinute' ? 'W' : 'Wh'), chart.yScale());
	}).load();
	return;
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
				mappedSourceId = mappedSourceIdForDataType(i, datum.sourceId);
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

function updateReadings() {
	d3.json(sn.runtime.urlHelper.mostRecentURL(sn.runtime.sourceGroupMap['Generation']), function(json) {
		if ( !(json && json.data && Array.isArray(json.data.results)) ) {
			sn.log('No data available for node {0}', sn.runtime.urlHelper.nodeId);
			return;
		}
		// totalPower, in kW
		var totalPower = d3.sum(json.data.results, function(d) { 
			return (d.watts ? d.watts : 0);
		}) / 1000;
		d3.select('#total-power-value').html(Number(totalPower).toFixed(2));
		if ( sn.runtime.totalPowerGauge ) {
			sn.runtime.totalPowerGauge.update(totalPower);
		}
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

function sourceMapping(sourceMap) {
	var result,
		dataType;

	if ( sn.env.showSources === 'true' ) {
		result = sourceMap;
	} else {
		result = {};
		for ( dataType in sourceMap ) {
			if ( sourceMap.hasOwnProperty(dataType) ) {
				result[dataType] = ['Main'];
			}
		}
	}
	return result;
}

function setupSourceGroupMap() {
	var map = {},
		sourceArray;
	sourceArray = (Array.isArray(sn.env.sourceIds) ? sn.env.sourceIds : sn.env.sourceIds.split(/\s*,\s*/));
	map['Generation'] = sourceArray;
	
	sourceArray = (Array.isArray(sn.env.consumptionSourceIds) ? sn.env.consumptionSourceIds : sn.env.consumptionSourceIds.split(/\s*,\s*/));
	map['Consumption'] = sourceArray;
	
	sn.runtime.sourceGroupMap = map;
	sn.runtime.sourceMap = sourceMapping(map);
}

function sourceSets(regenerate) {
	if ( !sn.runtime.sourceGroupMap || !sn.runtime.sourceSets || regenerate ) {
		setupSourceGroupMap();
		sn.runtime.sourceSets = [
			{ nodeUrlHelper : sn.runtime.consumptionUrlHelper, 
				sourceIds : sn.runtime.sourceGroupMap['Consumption'], 
				dataType : 'Consumption' },
			{ nodeUrlHelper : sn.runtime.urlHelper, 
				sourceIds : sn.runtime.sourceGroupMap['Generation'], 
				dataType : 'Generation' }
		];
	}
	return sn.runtime.sourceSets;
}

function setup(repInterval) {
	sn.runtime.reportableEndDate = repInterval.eDate;
	if ( sn.runtime.sourceColorMap === undefined ) {
		sn.runtime.sourceColorMap = sn.sourceColorMapping(sn.runtime.sourceMap, {
			displayDataType : displayNameForDataType
		});
	
		// we make use of sn.colorFn, so stash the required color map where expected
		sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

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
	}
	
	if ( sn.runtime.refreshReadingsTimer === undefined ) {
		// every minute update reading values
		updateReadings();
		sn.runtime.refreshReadingsTimer = setInterval(updateReadings, 60 * 1000);
	}

	// hide/show the data most-recent date
	setupOutdatedMessage(new Date(repInterval.endDateMillis));

	overviewAreaChartSetup(
		sn.runtime.overviewAreaContainer, 
		sn.runtime.overviewAreaChart, 
		sn.runtime.overviewAreaParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
return;
	wattChartSetup(
		sn.runtime.powerAreaContainer, 
		sn.runtime.powerAreaChart, 
		sn.runtime.powerAreaParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
	
	wattHourChartSetup(
		sn.runtime.energyBarContainer, 
		sn.runtime.energyBarChart, 
		sn.runtime.energyBarParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
		
	seasonalHourOfDayChartSetup(
		sn.runtime.seasonalHourOfDayContainer, 
		sn.runtime.seasonalHourOfDayChart, 
		sn.runtime.seasonalHourOfDayParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
	
	seasonalDayOfWeekChartSetup(
		sn.runtime.seasonalDayOfWeekContainer, 
		sn.runtime.seasonalDayOfWeekChart, 
		sn.runtime.seasonalDayOfWeekParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
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

function setupCounters() {
	// flip counter for Wh generated
	if ( sn.runtime.flipCounterKWh === undefined ) {
		sn.runtime.flipCounterKWh = sn.ui.flipCounter('#counter-kwh', {
			animate: (sn.env.flipCounterAnimate === 'true'),
			format: d3.format(',d'),
			flipperWidth: 34
		});
		sn.runtime.flipCounterKWh.render();
	}

	// flip counter for Wh consumed
	if ( sn.runtime.flipCounterKWhConsumed === undefined ) {
		sn.runtime.flipCounterKWhConsumed = sn.ui.flipCounter('#counter-kwh-consume', {
			animate: (sn.env.flipCounterAnimate === 'true'),
			format: d3.format(',d'),
			flipperWidth: 34
		});
		sn.runtime.flipCounterKWhConsumed.render();
	}

	// Wh counter utility (generation)
	if ( sn.runtime.wattHourPowerCounter !== undefined ) {
		sn.runtime.wattHourPowerCounter.stop();
	}
	sn.runtime.wattHourPowerCounter = sn.util.sumCounter(sn.runtime.urlHelper)
		.sourceIds(sn.env.sourceIds)
		.callback(function(sum) {
			var totalKWattHours = sum / 1000;
			sn.log('{0} total generation kWh', totalKWattHours);
			sn.runtime.flipCounterKWh.update(Math.round(totalKWattHours));
		})
		.start();

	// Wh counter utility (consumption)
	if ( sn.runtime.wattHourConsumptionCounter !== undefined ) {
		sn.runtime.wattHourConsumptionCounter.stop();
	}
	sn.runtime.wattHourConsumptionCounter = sn.util.sumCounter(sn.runtime.consumptionUrlHelper)
		.sourceIds(sn.env.consumptionSourceIds)
		.callback(function(sum) {
			var totalKWattHours = sum / 1000;
			sn.log('{0} total consumption kWh', totalKWattHours);
			sn.runtime.flipCounterKWhConsumed.update(Math.round(totalKWattHours));
		})
		.start();
}

function setupOutdatedMessage(endDate) {
	// if the data is stale by an hour or more, display the "outdated" message
	var format;
	if ( new Date().getTime() - endDate.getTime() >= (1000 * 60 * 60) ) {
		format = d3.time.format('%d %b %Y %H:%M');
		d3.select('#outdated-msg').style('display', 'block').select('.value').text(format(endDate));
	} else {
		d3.select('#outdated-msg').style('display', 'none');
	}
}

function onDocumentReady() {
	var mainChartHeight = 460;
	
	sn.setDefaultEnv({
		nodeId : 108,
		sourceIds : 'Main',
		consumptionNodeId : 108,
		consumptionSourceIds : 'A,B,C',
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		numMonths : 4,
		numYears : 1,
		wiggle : 'true',
		linkOld : 'false',
		maxPowerKW : 4,
		powerGaugeTicks : 4,
		swapSeconds : 20,
		northernHemisphere : 'false'
	});
	sn.runtime.refreshMs = sn.env.minutePrecision * 60 * 1000;

	sn.runtime.overviewAreaParameters = new sn.Configuration({
		height: 80,
		padding : [0, 0, 15, 0],
		aggregate : 'Month',
		wiggle : (sn.env.wiggle === 'true'),
		plotProperties : {Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.overviewAreaContainer = d3.select(d3.select('#overview-chart').node().parentNode);
	sn.runtime.overviewAreaChart = sn.chart.powerAreaChart('#overview-chart', sn.runtime.overviewAreaParameters)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback);
	
	sn.runtime.energyBarParameters = new sn.Configuration({
		height : mainChartHeight,
		aggregate : 'Hour',
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false)
	});
	sn.runtime.energyBarContainer = d3.select(d3.select('#watthour-chart').node().parentNode);
	sn.runtime.energyBarChart = sn.chart.energyIOBarChart('#watthour-chart', sn.runtime.energyBarParameters)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback);

	sn.runtime.powerAreaParameters = new sn.Configuration({
		height : mainChartHeight
	});
	sn.runtime.powerAreaContainer = d3.select(d3.select('#watt-chart').node().parentNode);
	sn.runtime.powerAreaChart = sn.chart.powerIOAreaChart('#watt-chart', sn.runtime.powerAreaParameters)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback);

	sn.runtime.seasonalHourOfDayParameters = new sn.Configuration({
		height : mainChartHeight,
		aggregate : 'SeasonalHourOfDay',
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		plotProperties : {SeasonalHourOfDay : 'wattHours'}
	});
	sn.runtime.seasonalHourOfDayContainer = d3.select(d3.select('#seasonal-hod-chart').node().parentNode);
	sn.runtime.seasonalHourOfDayChart = sn.chart.seasonalHourOfDayLineChart('#seasonal-hod-chart', sn.runtime.seasonalHourOfDayParameters)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback);

	sn.runtime.seasonalDayOfWeekParameters = new sn.Configuration({
		height : mainChartHeight,
		aggregate : 'SeasonalDayOfWeek',
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		plotProperties : {SeasonalDayOfWeek : 'wattHours'}
	});
	sn.runtime.seasonalDayOfWeekContainer = d3.select(d3.select('#seasonal-dow-chart').node().parentNode);
	sn.runtime.seasonalDayOfWeekChart = sn.chart.seasonalDayOfWeekLineChart('#seasonal-dow-chart', sn.runtime.seasonalDayOfWeekParameters)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback);
	/*
	// find our available data range, and then draw our charts!
	function handleAvailableDataRange(event) {
		setup(event.data.reportableInterval, event.data.availableSourcesMap);
		setupCounters(event.data.reportableInterval);
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				sn.availableDataRange(urlHelperForAvailbleDataRange, sn.env.dataTypes, function(data) {
					var jsonEndDate = data.reportableInterval.eLocalDate;
					
					setupOutdatedMessage(new Date(data.reportableInterval.endDateMillis));

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
						if ( sn.runtime.seasonalDayOfWeekChart !== undefined ) {
							seasonalDayOfWeekChartSetup(sn.runtime.sourceMap);
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
	*/
	
	sn.runtime.urlHelper = sn.datum.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.datum.nodeUrlHelper(sn.env.consumptionNodeId);

	sn.env.sourceIds = sn.env.sourceIds.split(/\s*,\s*/);
	sn.env.consumptionSourceIds = sn.env.consumptionSourceIds.split(/\s*,\s*/);

	setupUI();
	sn.datum.availableDataRange(sourceSets(), function(reportableInterval) {
		setup(reportableInterval);
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				sn.datum.availableDataRange(sourceSets(), function(repInterval) {
					var jsonEndDate = repInterval.eDate;
					if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
						setup(repInterval);
					} else {
						setupOutdatedMessage(jsonEndDate);
					}
				});
			}, sn.runtime.wChartRefreshMs);
		}
	});
}
