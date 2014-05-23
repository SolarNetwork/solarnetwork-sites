/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-power-io 1.0.0
 */

sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.globalCounter = sn.counter();
sn.runtime.excludeSources = new sn.Configuration();

function setup(repInterval, sourceMap) {
	var endDate = repInterval.eDate;
	var powerAreaChart = undefined;
	var sourceColorMap = sn.sourceColorMapping(sourceMap);
	
	// we make use of sn.colorFn, so stash the required color map where expected
	sn.runtime.colorData = sourceColorMap.colorMap;

	// create copy of color data for reverse ordering so labels vertically match chart layers
	sn.colorDataLegendTable('#source-labels', sourceColorMap.colorMap.slice().reverse(), legendClickHandler, function(s) {
		if ( sn.env.linkOld === 'true' ) {
			s.html(function(d) {
				return '<a href="' +sn.runtime.urlHelper.nodeDashboard(d) +'">' +d +'</a>';
			});
		} else {
			s.text(Object);
		}
	});

	var e = new Date(endDate.getTime());
	e.setMinutes(0,0,0); // truncate to nearest hour

	// adjust display units as needed (between W and kW, etc)
	function adjustChartDisplayUnits(chartKey, baseUnit, scale) {
		var unit = (scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
		d3.selectAll(chartKey +' .unit').text(unit);
	}

	// Watt stacked area chart
	function wattChartSetup(endDate) {
		var e = new Date(endDate.getTime());
		// truncate end date to nearest day precision minutes
		e.setMinutes((endDate.getMinutes() - (endDate.getMinutes() % sn.env.minutePrecision)), 0, 0);
		
		var wRange = [
			new Date(e.getTime() - (sn.env.numHours * 60 * 60 * 1000)), 
			new Date(e.getTime())
			];
		powerAreaChart = sn.chart.powerIOAreaChart('#day-watt', {
			height: 400,
			excludeSources: sn.runtime.excludeSources
		});
		var q = queue();
		sn.env.dataTypes.forEach(function(e, i) {
			var urlHelper = (i === 0 ? sn.runtime.devUrlHelper : sn.runtime.urlHelper); // FIXME: remove
			q.defer(d3.json, urlHelper.dateTimeQuery(e, wRange[0], wRange[1], sn.env.minutePrecision));
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
					mappedSourceId = sourceColorMap.displaySourceMap[sn.env.dataTypes[i]][datum.sourceId];
					if ( mappedSourceId !== undefined ) {
						datum.sourceId = mappedSourceId;
					}
				}
				combinedData = combinedData.concat(json.data);
			}
			powerAreaChart.consumptionSourceCount(sourceMap[sn.env.dataTypes[0]].length);
			powerAreaChart.load(combinedData);
			sn.log("Power IO chart watt range: {0}", powerAreaChart.yDomain());
			sn.log("Power IO chart time range: {0}", powerAreaChart.xDomain());
			adjustChartDisplayUnits('.watt-chart', 'W', powerAreaChart.yScale());
		});
	}
	
	wattChartSetup(endDate);
	setInterval(function() {
		d3.json(sn.runtime.urlHelper.reportableInterval(sn.env.dataTypes), function(error, json) {
			if ( json.data === undefined || json.data.endDateMillis === undefined ) {
				sn.log('No data available for node {0}: {1}', sn.runtime.urlHelper.nodeId(), (error ? error : 'unknown reason'));
				return;
			}
			
			var endDate = sn.dateTimeFormat.parse(json.data.endDate);
			wattChartSetup(endDate);
		});
	}, sn.config.wChartRefreshMs);
	
	function legendClickHandler(d, i) {
		sn.runtime.excludeSources.toggle(d.source);
		if ( powerAreaChart !== undefined ) {
			// use a slight delay, otherwise transitions can be jittery
			setTimeout(function() {
				powerAreaChart.regenerate();
				adjustChartDisplayUnits('.watt-chart', 'W', powerAreaChart.yScale());
			}, powerAreaChart.transitionMs() * 0.5);
		}
	}
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 30,
		consumptionNodeId : 108,
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		wiggle : 'false',
		linkOld : 'false',
		maxPowerKW : 3,
		dataTypes: ['Consumption', 'Power']
	});
	sn.config.wChartRefreshMs = sn.env.minutePrecision * 60 * 1000;
	
	// setup DOM based on environment
	d3.select('#num-days').text(sn.env.numDays);
	d3.select('#num-hours').text(sn.env.numHours);
	d3.selectAll('.node-id').text(sn.env.nodeId);
	
	// find our available data range, and then draw our charts!
	function handleAvailableDataRange(event) {
		setup(event.data.reportableInterval, event.data.availableSourcesMap);
		document.removeEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	}
	document.addEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.devUrlHelper = sn.nodeUrlHelper(sn.env.consumptionNodeId);
	sn.availableDataRange(function(e, i) {
		if ( !arguments.length ) return sn.runtime.urlHelper;
		return (i === 0 ? sn.runtime.devUrlHelper : sn.runtime.urlHelper);
	}, sn.env.dataTypes);
}
