/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-energy-io 1.0.0
 */

sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

function setup(repInterval, sourceMap) {
	var reportableEndDate = repInterval.eDate;
	var energyBarChart = undefined;
	var monthEnergyBarChart = undefined;
	var sourceColorMap = sn.sourceColorMapping(sourceMap);
	
	// we make use of sn.colorFn, so stash the required color map where expected
	sn.runtime.colorData = sourceColorMap.colorMap;
	
	// adjust display units as needed (between W and kW, etc)
	function adjustChartDisplayUnits(chartKey, baseUnit, scale) {
		var unit = (scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
		d3.selectAll(chartKey +' .unit').text(unit);
	}

	// handle clicks on legend handler
	function legendClickHandler(d, i) {
		sn.runtime.excludeSources.toggle(d.source);
		if ( energyBarChart !== undefined ) {
			// use a slight delay, otherwise transitions can be jittery
			setTimeout(function() {
				energyBarChart.regenerate();
				adjustChartDisplayUnits('.watthour-chart', 'Wh', energyBarChart.yScale());
			}, energyBarChart.transitionMs() * 0.5);
		}
	}

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
	
	var wattHourAggregate = 'Month';

	// Watt hour stacked bar chart (hours)
	function wattHourChartSetup(endDate) {
		var end;
		var start;
		var timeCount;
		var timeUnit;
		if ( wattHourAggregate === 'Month' ) {
			timeCount = (sn.env.numYears || 1);
			timeUnit = 'year';
			start = d3.time.year.offset(d3.time.month.ceil(endDate), -timeCount);
		} else if ( wattHourAggregate === 'Day' ) {
			timeCount = (sn.env.numMonths || 4);
			timeUnit = 'month';
			start = d3.time.month.offset(d3.time.day.ceil(endDate), -timeCount);
		} else {
			// assume Hour
			timeCount = (sn.env.numDays || 7);
			timeUnit = 'day';
			end = d3.time.hour(endDate);
			start = d3.time.day.offset(end, 1 - timeCount);
		}
		if ( energyBarChart === undefined ) {
			energyBarChart = sn.chart.energyIOBarChart('#watthour-chart', {
				excludeSources : sn.runtime.excludeSources,
				northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false)
			});
		}
		
		d3.select('.watthour-chart .time-count').text(timeCount);
		d3.select('.watthour-chart .time-unit').text(timeUnit);
		
		var q = queue();
		sn.env.dataTypes.forEach(function(e, i) {
			var urlHelper = (i === 0 ? sn.runtime.devUrlHelper : sn.runtime.urlHelper); // FIXME: remove
			q.defer(d3.json, urlHelper.dateTimeQuery(e, start, endDate, wattHourAggregate));
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
			energyBarChart.consumptionSourceCount(sourceMap[sn.env.dataTypes[0]].length);
			energyBarChart.load(combinedData, {
				aggregate : wattHourAggregate
			});
			sn.log("Energy IO chart watt hour range: {0}", energyBarChart.yDomain());
			sn.log("Energy IO chart time range: {0}", energyBarChart.xDomain());
			adjustChartDisplayUnits('.watthour-chart', 'Wh', energyBarChart.yScale());
		});
	}
	wattHourChartSetup(reportableEndDate);

	// toggle between supported aggregate levels
	d3.select('#range-toggle').classed('clickable', true).on('click', function(d, i) {
		var currAgg = energyBarChart.aggregate();
		wattHourAggregate = (currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'Hour');
		wattHourChartSetup(reportableEndDate);
	});
	
	// toggle sum lines on/off
	d3.select('#sumline-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var off = me.classed('off');
		me.classed('off', !off);
		energyBarChart.showSumLine(off);
	});
	
	// toggle hemispheres
	d3.select('#hemisphere-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var south = me.classed('south');
		me.classed('south', !south);
		energyBarChart.northernHemisphere(south);
	});
	
	// refresh chart data on interval
	setInterval(function() {
		d3.json(sn.runtime.urlHelper.reportableInterval(sn.env.dataTypes), function(error, json) {
			if ( json.data === undefined || json.data.endDateMillis === undefined ) {
				sn.log('No data available for node {0}: {1}', sn.runtime.urlHelper.nodeId(), (error ? error : 'unknown reason'));
				return;
			}
			if ( energyBarChart !== undefined ) {
				var jsonEndDate = sn.dateTimeFormat.parse(json.data.endDate);
				var xDomain = energyBarChart.xDomain();
				var currEndDate = xDomain[xDomain.length - 1];
				var newEndDate = new Date(jsonEndDate.getTime());
				currEndDate.setMinutes(0,0,0); // truncate to nearest hour
				newEndDate.setMinutes(0,0,0);
				if ( newEndDate.getTime() > currEndDate.getTime() ) {
					reportableEndDate = jsonEndDate;
					wattHourChartSetup(reportableEndDate);
				}
			}
		});
	}, sn.config.wChartRefreshMs);
	
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 30,
		consumptionNodeId : 108,
		numDays : 7,
		numMonths : 4,
		numYears : 2,
		maxPowerKW : 3,
		northernHemisphere : 'false',
		dataTypes: ['Consumption', 'Power']
	});
	sn.config.wChartRefreshMs = 30 * 60 * 1000;
	
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
