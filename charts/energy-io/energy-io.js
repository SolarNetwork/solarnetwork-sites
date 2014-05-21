/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-energy-io 1.0.0
 */

sn.config.debug = true;
sn.config.defaultTransitionMs = 600;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.globalCounter = sn.counter();
sn.runtime.excludeSources = new sn.Configuration();

function setup(repInterval, sourceList) {
	var endDate = repInterval.eDate;
	var energyAreaChart = undefined;
	
	// create static mapping of source -> color, so consistent across charts
	sn.runtime.colorData = sn.colorMap(sn.colors.steelblue, sourceList);
	
	// create copy of color data for reverse ordering so labels vertically match chart layers
	sn.colorDataLegendTable('#source-labels', sn.runtime.colorData.slice().reverse(), legendClickHandler, function(s) {
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
		energyAreaChart = sn.chart.energyIOAreaChart('#day-watt', {
			height: 400,
			padding: [10, 0, 20, 30] // gives room to axis
		});
		d3.json(sn.runtime.urlHelper.dateTimeQuery(sn.env.dataType, wRange[0], wRange[1], sn.env.minutePrecision), function(json) {
			energyAreaChart.load(json.data);
			adjustChartDisplayUnits('.watt-chart', 'W', energyAreaChart.yScale());
		});
	}
	
	wattChartSetup(endDate);
	setInterval(function() {
		d3.json(sn.runtime.urlHelper.reportableInterval([sn.env.dataType]), function(error, json) {
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
		if ( energyAreaChart !== undefined ) {
			// use a slight delay, otherwise transitions can be jittery
			setTimeout(function() {
				energyAreaChart.regenerate();
				adjustChartDisplayUnits('.watt-chart', 'W', energyAreaChart.yScale());
			}, sn.config.defaultTransitionMs * .8);
		}
	}

	function updateReadings() {
		d3.json(sn.runtime.urlHelper.mostRecentQuery(sn.env.dataType), function(json) {
			if ( json.data === undefined ) {
				sn.log('No data available for node {0}', sn.runtime.urlHelper.nodeId());
				return;
			}
		});
	}

	// every minute update reading values
	updateReadings();
	setInterval(function() {
		updateReadings();
	}, 60 * 1000);
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 30,
		dataType : 'Power',
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		wiggle : 'false',
		linkOld : 'false',
		maxPowerKW : 3,
	});
	sn.config.wChartRefreshMs = sn.env.minutePrecision * 60 * 1000;
	
	// setup DOM based on environment
	d3.select('#num-days').text(sn.env.numDays);
	d3.select('#num-hours').text(sn.env.numHours);
	d3.selectAll('.watt-chart .dataType').text((function() {
		if ( sn.env.dataType === 'Consumption' ) {
			return 'use';
		}
		return 'output';
	})());
	d3.selectAll('.watthour-chart .dataType').text((function() {
		if ( sn.env.dataType === 'Consumption' ) {
			return 'consumption';
		}
		return 'production';
	})());
	d3.selectAll('#readings .total-power .dataType').text((function() {
		if ( sn.env.dataType === 'Consumption' ) {
			return 'Use';
		}
		return 'Power';
	})());
	d3.selectAll('.node-id').text(sn.env.nodeId);
	
	// find our available data range, and then draw our charts!
	function handleAvailableDataRange(event) {
		setup(event.data.reportableInterval, event.data.availableSources);
		document.removeEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	}
	document.addEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	sn.runtime.urlHelper = sn.NodeUrlHelper(sn.env.nodeId);
	sn.availableDataRange(sn.runtime.urlHelper, ['Consumption', 'Power']);
}
