/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-seasonal-dow-io 1.0.0
 */

sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

// adjust display units as needed (between W and kW, etc)
function adjustChartDisplayUnits(chartKey, baseUnit, scale) {
	var unit = (scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
	d3.selectAll(chartKey +' .unit').text(unit);
}

// handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	if ( sn.runtime.seasonalDayOfWeekChart !== undefined ) {
		// use a slight delay, otherwise transitions can be jittery
		setTimeout(function() {
			sn.runtime.seasonalDayOfWeekChart.regenerate();
			adjustChartDisplayUnits('.seasonal-dow-chart', 'Wh', sn.runtime.seasonalDayOfWeekChart.yScale());
		}, sn.runtime.seasonalDayOfWeekChart.transitionMs() * 0.5);
	}
}

// seasonal hour-of-day line chart
function seasonalDayOfWeekChartSetup(endDate, sourceMap) { // FIXME: endDate unused
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
				mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[sn.env.dataTypes[i]][datum.sourceId];
				if ( mappedSourceId !== undefined ) {
					datum.sourceId = mappedSourceId;
				}
			}
			combinedData = combinedData.concat(json.data.results);
		}
		
		
		sn.runtime.seasonalDayOfWeekChart.load(combinedData, sn.runtime.seasonalDayOfWeekParameters);
		sn.log("Seasonal HOD IO chart watt hour range: {0}", sn.runtime.seasonalDayOfWeekChart.yDomain());
		sn.log("Seasonal HOD IO chart time range: {0}", sn.runtime.seasonalDayOfWeekChart.xDomain());
		adjustChartDisplayUnits('.seasonal-dow-chart', 'Wh', sn.runtime.seasonalDayOfWeekChart.yScale());
	});
}

function setup(repInterval, sourceMap) {
	sn.runtime.reportableEndDate = repInterval.eLocalDate;
	sn.runtime.sourceMap = sourceMap;
	sn.runtime.sourceColorMap = sn.sourceColorMapping(sourceMap);
	
	// we make use of sn.colorFn, so stash the required color map where expected
	sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

	// pass our source mapping to the chart, to know what source IDs are consumption vs generation
	var dataType = undefined;
	var sourceId = undefined;
	var sourceIdDataTypeMap = {};
	for ( dataType in sn.runtime.sourceColorMap.displaySourceMap ) {
		sourceIdDataTypeMap[dataType] = {};
		for ( sourceId in sn.runtime.sourceColorMap.displaySourceMap[dataType] ) {
			sourceIdDataTypeMap[sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId]] = dataType;
		}
	}
	sn.runtime.seasonalDayOfWeekChart.sourceIdDataTypeMap(sourceIdDataTypeMap);


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
	
	seasonalDayOfWeekChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
}

function urlHelperForAvailbleDataRange(e, i) {
	if ( !arguments.length ) return sn.runtime.urlHelper;
	return (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
}

function setupUI() {
	d3.selectAll('.node-id').text(sn.env.nodeId);
	
	// update details form based on env
	['nodeId', 'consumptionNodeId'].forEach(function(e) {
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
			seasonalDayOfWeekChartSetup(sn.runtime.reportableEndDate, sn.runtime.sourceMap);
		}
	});

	// toggle sum lines on/off
	d3.select('#sumline-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var off = me.classed('off');
		me.classed('off', !off);
		sn.runtime.seasonalDayOfWeekChart.showSumLine(off);
	});
	
	// toggle hemispheres
	d3.select('#hemisphere-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var south = me.classed('south');
		me.classed('south', !south);
		sn.runtime.seasonalDayOfWeekChart.northernHemisphere(south);
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
	sn.runtime.wChartRefreshMs = 10 * 60 * 1000;

	sn.runtime.seasonalDayOfWeekParameters = new sn.Configuration({
		excludeSources : sn.runtime.excludeSources,
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false)
	});

	sn.runtime.seasonalDayOfWeekChart = sn.chart.seasonalDayOfWeekLineChart('#seasonal-dow-chart', sn.runtime.seasonalDayOfWeekParameters);
	
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
					if ( sn.runtime.seasonalDayOfWeekChart !== undefined ) {
						var jsonEndDate = sn.dateTimeFormatLocal.parse(json.data.endDate);
						if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
							sn.runtime.reportableEndDate = jsonEndDate;
							seasonalDayOfWeekChartSetup(jsonEndDate, sn.runtime.sourceMap);
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
