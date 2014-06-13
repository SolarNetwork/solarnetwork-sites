/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-energy-io 1.0.0
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
	if ( sn.runtime.energyBarChart !== undefined ) {
		// use a slight delay, otherwise transitions can be jittery
		setTimeout(function() {
			sn.runtime.energyBarChart.regenerate();
			adjustChartDisplayUnits('.watthour-chart', 'Wh', sn.runtime.energyBarChart.yScale());
		}, sn.runtime.energyBarChart.transitionMs() * 0.5);
	}
}

function urlHelperForAvailbleDataRange(e, i) {
	if ( !arguments.length ) return sn.runtime.urlHelper;
	return (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
}

function setup(repInterval, sourceMap) {
	sn.runtime.reportableEndDate = repInterval.eLocalDate;
	sn.runtime.sourceMap = sourceMap;
	sn.runtime.sourceColorMap = sn.sourceColorMapping(sourceMap);
	
	// we make use of sn.colorFn, so stash the required color map where expected
	sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

	// set up form-based details
	if ( sourceMap.Consumption !== undefined ) {
		d3.select('#details .consumption').style('color', 
			sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap.Consumption[sourceMap.Consumption[0]]]);
	}
	if ( sourceMap.Power !== undefined ) {
		d3.select('#details .generation').style('color', 
			sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap.Power[sourceMap.Power[0]]]);
	}
	
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
		}
	});

	setupCounters(repInterval);
}

function setupCounters(repInterval) {
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
	sn.runtime.wattHourPowerCounter = sn.util.aggregateCounter({
		dataType: 'Power',
		nodeUrlHelper: sn.runtime.urlHelper,
		startingInterval: {startDate: repInterval.sLocalDate, endDate: repInterval.eLocalDate},
		callback : function() {
			var totalKWattHours = this.aggregateValue() / 1000;
			
			sn.log('{0} total kWh', totalKWattHours);
			sn.runtime.flipCounterKWh.update(Math.round(totalKWattHours));
		}
	});
	sn.runtime.wattHourPowerCounter.start();

	// Wh counter utility (consumption)
	if ( sn.runtime.wattHourConsumptionCounter !== undefined ) {
		sn.runtime.wattHourConsumptionCounter.stop();
	}
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

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 108,
		consumptionNodeId : 108,
		minutePrecision : 10,
		linkOld : 'false',
		dataTypes: ['Consumption', 'Power']
	});
	sn.runtime.refreshMs = sn.env.minutePrecision * 60 * 1000;

	// find our available data range, and then draw our charts!
	function handleAvailableDataRange(event) {
		setup(event.data.reportableInterval, event.data.availableSourcesMap);
	}
	document.addEventListener('snAvailableDataRange', handleAvailableDataRange, false);
	sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.nodeUrlHelper(sn.env.consumptionNodeId);
	sn.availableDataRange(urlHelperForAvailbleDataRange, sn.env.dataTypes);
}
