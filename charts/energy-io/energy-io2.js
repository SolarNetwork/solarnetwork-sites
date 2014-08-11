/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-energy-io 1.0.0
 */

sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

//adjust display units as needed (between W and kW, etc)
function adjustChartDisplayUnits(chartKey, baseUnit, scale, unitKind) {
	var unit = (scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
	d3.selectAll(chartKey +' .unit').text(unit);
	if ( unitKind !== undefined ) {
		d3.selectAll(chartKey + ' .unit-kind').text(unitKind);
	}
}

// handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	if ( sn.runtime.energyBarIOChart !== undefined ) {
		// use a slight delay, otherwise transitions can be jittery
		setTimeout(function() {
			sn.runtime.energyBarIOChart.regenerate();
			adjustChartDisplayUnits('.watthour-chart', 'Wh', sn.runtime.energyBarIOChart.yScale());
		}, sn.runtime.energyBarIOChart.transitionMs() * 0.5);
	}
}

// show/hide the proper range selection based on the current aggregate level
function updateRangeSelection() {
	d3.selectAll('#details div.range').style('display', function() {
		return (d3.select(this).classed(sn.runtime.energyBarIOParameters.aggregate.toLowerCase()) ? 'block' : 'none');
	});
	d3.select('#hemisphere-toggle').transition().duration(sn.runtime.energyBarIOChart.transitionMs())
		.style('opacity', (sn.runtime.energyBarIOParameters.aggregate == 'Month' ? 1 : 0));
}

function chartDataCallback(dataType, datum) {
	// create date property
	if ( datum.localDate ) {
		datum.date = sn.dateTimeFormat.parse(datum.localDate +' ' +datum.localTime);
	} else if ( datum.created ) {
		datum.date = sn.timestampFormat.parse(datum.created);
	} else {
		datum.date = null;
	}
}

function colorForDataTypeSource(dataType, sourceId, sourceIndex) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.colorData[mappedSourceId];
}

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.excludeSources.enabled(mappedSourceId);
}

// Watt stacked area overlap chart
function energyBarIOChartSetup(endDate, sourceMap) {
	var queryRange = sn.datumLoaderQueryRange(sn.runtime.energyBarIOParameters.aggregate,
		(sn.env.minutePrecision || 10), sn.env, endDate);
	
	d3.select('.energy-bar-chart .time-count').text(queryRange.timeCount);
	d3.select('.energy-bar-chart .time-unit').text(queryRange.timeUnit);
	
	var plotPropName = sn.runtime.energyBarIOParameters.plotProperties[sn.runtime.energyBarIOParameters.aggregate];
	
	sn.datumLoader(sn.env.dataTypes, urlHelperForAvailbleDataRange, 
			queryRange.start, queryRange.end, sn.runtime.energyBarIOParameters.aggregate)
		.holeRemoverCallback(function(data) {
			// filter out any data where data value === -1
			return data.filter(function(e) {
				return (e[plotPropName] >= 0);
			});
		})
		.callback(function(results) {
			sn.runtime.energyBarIOChart.reset();
			sn.env.dataTypes.forEach(function(e, i) {
				var dataTypeResults = results[e];
				sn.runtime.energyBarIOChart.load(dataTypeResults, e);
			});
			sn.runtime.energyBarIOChart.regenerate();
			adjustChartDisplayUnits('.energy-bar-chart', 'Wh',  sn.runtime.energyBarIOChart.yScale(), 'energy');
			sn.log("Energy Bar I/O chart watt range: {0}", sn.runtime.energyBarIOChart.yDomain());
			sn.log("Energy Bar I/O chart time range: {0}", sn.runtime.energyBarIOChart.xDomain());
		}).load();
}

/* Watt hour stacked bar chart
function wattHourChartSetup(endDate, sourceMap) {
	var end;
	var start;
	var timeCount;
	var timeUnit;
	// for aggregate time ranges, the 'end' date in inclusive
	if ( sn.runtime.energyBarIOParameters.aggregate === 'Month' ) {
		timeCount = (sn.env.numYears || 1);
		timeUnit = 'year';
		end = d3.time.month.utc.floor(endDate);
		start = d3.time.year.utc.offset(end, -timeCount);
	} else if ( sn.runtime.energyBarIOParameters.aggregate === 'Day' ) {
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
		q.defer(d3.json, urlHelper.dateTimeQuery(e, start, end, sn.runtime.energyBarIOParameters.aggregate));
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
		sn.runtime.energyBarIOChart.consumptionSourceCount(sourceMap[sn.env.dataTypes[0]].length);
		sn.runtime.energyBarIOChart.load(combinedData, sn.runtime.energyBarIOParameters);
		sn.log("Energy IO chart watt hour range: {0}", sn.runtime.energyBarIOChart.yDomain());
		sn.log("Energy IO chart time range: {0}", sn.runtime.energyBarIOChart.xDomain());
		adjustChartDisplayUnits('.watthour-chart', 'Wh', sn.runtime.energyBarIOChart.yScale());
	});
}
*/

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
	
	updateRangeSelection();
	
	energyBarIOChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
}

function urlHelperForAvailbleDataRange(e, i) {
	if ( !arguments.length ) return sn.runtime.urlHelper;
	return (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
}

function setupUI() {
	d3.selectAll('.node-id').text(sn.env.nodeId);
	
	// update details form based on env
	['nodeId', 'consumptionNodeId', 'numDays', 'numMonths', 'numYears'].forEach(function(e) {
		d3.select('input[name='+e+']').property('value', sn.env[e]);
	});

	// update the chart details
	d3.selectAll('#details input').on('change', function(e) {
		var me = d3.select(this);
		var propName = me.attr('name');
		var getAvailable = false;
		sn.env[propName] = me.property('value');
		if ( propName === 'consumptionNodeId' ) {
			sn.runtime.consumptionUrlHelper = sn.nodeUrlHelper(sn.env[propName]);
			getAvailable = true;
		} else if ( propName === 'nodeId' ) {
			sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env[propName]);
			getAvailable = true;
		}
		if ( getAvailable ) {
			sn.availableDataRange(urlHelperForAvailbleDataRange, sn.env.dataTypes);
		} else {
			energyBarIOChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
		}
	});

	// toggle between supported aggregate levels
	d3.select('#range-toggle').classed('clickable', true).on('click', function(d, i) {
		var me = d3.select(this);
		me.classed('hit', true);
		var currAgg = sn.runtime.energyBarIOChart.aggregate();
		sn.runtime.energyBarIOParameters.aggregate = (currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'Hour');
		energyBarIOChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
		setTimeout(function() {
			me.classed('hit', false);
		}, 500);
		updateRangeSelection();
	});
	
	// toggle sum lines on/off
	d3.select('#sumline-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var off = me.classed('off');
		me.classed('off', !off);
		sn.runtime.energyBarIOChart.showSumLine(off);
	});
	
	// toggle hemispheres
	d3.select('#hemisphere-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var south = me.classed('south');
		me.classed('south', !south);
		sn.runtime.energyBarIOChart.northernHemisphere(south);
	});
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 30,
		consumptionNodeId : 108,
		numDays : 7,
		numMonths : 4,
		numYears : 2,
		northernHemisphere : 'false',
		dataTypes: ['Consumption', 'Power']
	});
	sn.runtime.energyBarIOParameters = new sn.Configuration({
		aggregate : 'Hour',
		excludeSources : sn.runtime.excludeSources,
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		plotProperties : {Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});

	sn.runtime.wChartRefreshMs = 30 * 60 * 1000;

	sn.runtime.energyBarIOChart = sn.chart.energyIOBarChart('#watthour-chart', sn.runtime.energyBarIOParameters)
		.dataCallback(chartDataCallback)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback);
	
	setupUI();

	// find our available data range, and then draw our charts!
	function handleAvailableDataRange(event) {
		setup(event.data.reportableInterval, event.data.availableSourcesMap);
		//document.removeEventListener('snAvailableDataRange', handleAvailableDataRange, false);
		
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				d3.json(sn.runtime.urlHelper.reportableInterval(sn.env.dataTypes), function(error, json) {
					if ( json.data === undefined || json.data.endDateMillis === undefined ) {
						sn.log('No data available for node {0}: {1}', sn.runtime.urlHelper.nodeId(), (error ? error : 'unknown reason'));
						return;
					}
					if ( sn.runtime.energyBarIOChart !== undefined ) {
						var jsonEndDate = sn.dateTimeFormatLocal.parse(json.data.endDate);
						if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
							sn.runtime.reportableEndDate = jsonEndDate;
							energyBarIOChartSetup(jsonEndDate, sn.runtime.sourceMap);
						}
					}
				});
			}, sn.runtime.wChartRefreshMs);
		}
	}
	document.addEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.nodeUrlHelper(sn.env.consumptionNodeId);
	sn.availableDataRange(urlHelperForAvailbleDataRange, sn.env.dataTypes);
}
