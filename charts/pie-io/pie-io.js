/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-pie-io 1.0.0
 */

sn.config.debug = true;
sn.runtime.excludeSources = new sn.Configuration();

//adjust display units as needed (between W and kW, etc)
function adjustChartDisplayUnits(chartKey, baseUnit, scale) {
	var unit = (scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
	d3.selectAll(chartKey +' .unit').text(unit);
}

//handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	if ( sn.runtime.energyPieChart !== undefined ) {
		// use a slight delay, otherwise transitions can be jittery
		setTimeout(function() {
			sn.runtime.energyPieChart.regenerate();
			adjustChartDisplayUnits('.watthour-chart', 'Wh', sn.runtime.energyPieChart.scale());
		}, sn.runtime.energyPieChart.transitionMs() * 0.5);
	}
}

// Watt stacked area chart
function energyPieChartSetup(endDate, sourceMap) {
	var end;
	var start;
	var timeCount;
	var timeUnit;
	// for aggregate time ranges, the 'end' date in inclusive
	if ( sn.runtime.energyPieParameters.aggregate === 'Month' ) {
		timeCount = (sn.env.numYears || 1);
		timeUnit = 'year';
		end = d3.time.month.utc.floor(endDate);
		start = d3.time.year.utc.offset(end, -timeCount);
	} else if ( sn.runtime.energyPieParameters.aggregate === 'Day' ) {
		timeCount = (sn.env.numMonths || 3);
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
		q.defer(d3.json, urlHelper.dateTimeList(e, start, end, sn.runtime.energyPieParameters.aggregate));
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
				sn.log('No data available for node {0} data type {1}', sn.runtime.urlHelper.nodeId(), sn.env.dataTypes[i]);
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
		sn.runtime.energyPieChart.consumptionSourceCount(sourceMap[sn.env.dataTypes[0]].length);
		sn.runtime.energyPieChart.load(combinedData);
		sn.log("Energy Pie IO chart Wh total: {0}", sn.runtime.energyPieChart.totalValue());
		sn.log("Energy Pie IO chart time range: {0}", [start, end]);
		adjustChartDisplayUnits('.watthour-chart', 'Wh', sn.runtime.energyPieChart.scale());
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

	updateRangeSelection();

	energyPieChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
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
			energyPieChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
		}
	});

	// toggle between supported aggregate levels
	d3.select('#range-toggle').classed('clickable', true).on('click', function(d, i) {
		var me = d3.select(this);
		me.classed('hit', true);
		var currAgg = sn.runtime.energyPieParameters.aggregate;
		sn.runtime.energyPieParameters.aggregate = (currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'Hour');
		energyPieChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
		setTimeout(function() {
			me.classed('hit', false);
		}, 500);
		updateRangeSelection();
	});

	// toggle percentages on/off
	d3.select('#label-percent-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var off = me.classed('off');
		me.classed('off', !off);
		sn.runtime.energyPieParameters.toggle('hidePercentages', !off);
		sn.runtime.energyPieChart.regenerate();
	});
	
	// toggle labels on/off
	d3.select('#label-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var off = me.classed('off');
		me.classed('off', !off);
		sn.runtime.energyPieParameters.toggle('hideValues', !off);
		sn.runtime.energyPieChart.regenerate();
	});
	
}

//show/hide the proper range selection based on the current aggregate level
function updateRangeSelection() {
	d3.selectAll('#details div.range').style('display', function() {
		return (d3.select(this).classed(sn.runtime.energyPieParameters.aggregate.toLowerCase()) ? 'block' : 'none');
	});
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 108,
		consumptionNodeId : 108,
		minutePrecision : 10,
		numDays : 7,
		numMonths : 3,
		numYears : 1,
		linkOld : 'false',
		dataTypes: ['Consumption', 'Power']
	});
	
	sn.runtime.wChartRefreshMs = 30 * 60 * 1000;

	sn.runtime.energyPieParameters = new sn.Configuration({
		aggregate : 'Hour',
		excludeSources : sn.runtime.excludeSources
	});
	
	sn.runtime.energyPieChart = sn.chart.energyIOPieChart('#pie-io-chart', sn.runtime.energyPieParameters);
	
	setupUI();

	// find our available data range, and then draw our charts!
	function handleAvailableDataRange(event) {
		setup(event.data.reportableInterval, event.data.availableSourcesMap);
		
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				d3.json(sn.runtime.urlHelper.reportableInterval(sn.env.dataTypes), function(error, json) {
					if ( json.data === undefined || json.data.endDateMillis === undefined ) {
						sn.log('No data available for node {0}: {1}', sn.runtime.urlHelper.nodeId(), (error ? error : 'unknown reason'));
						return;
					}
					if ( sn.runtime.energyPieChart !== undefined ) {
						var jsonEndDate = sn.dateTimeFormatLocal.parse(json.data.endDate);
						if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
							sn.runtime.reportableEndDate = jsonEndDate;
							energyPieChartSetup(jsonEndDate, sn.runtime.sourceMap);
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