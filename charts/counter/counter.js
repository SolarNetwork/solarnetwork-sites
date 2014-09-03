/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.5
 * @require solarnetwork-d3-datum 1.0.0
 * @require solarnetwork-d3-util-counter 1.0.0
 */

sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

// adjust display units as needed (between W and kW, etc)
function adjustChartDisplayUnits(chartKey, baseUnit, scale) {
	var unit = (scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
	d3.selectAll(chartKey +' .unit').text(unit);
}

function urlHelperForAvailbleDataRange(e, i) {
	if ( !arguments.length ) return sn.runtime.urlHelper;
	return (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
}

function setup() {
	var inputs = d3.selectAll('#details input')
		.on('change', function(e) {
			var me = d3.select(this);
			var propName = me.attr('name');
			var getAvailable = false;
			sn.env[propName] = me.property('value');
			if ( propName === 'consumptionNodeId' ) {
				sn.runtime.consumptionUrlHelper = sn.nodeUrlHelper(sn.env[propName]);
			} else if ( propName === 'nodeId' ) {
				sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env[propName]);
			}
			setupCounters();
		}).each(function(e) {
			var input = d3.select(this);
			var name = input.attr('name');
			if ( sn.env[name] ) {
				input.property('value', sn.env[name]);
			}
		});

	setupCounters();
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

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 108,
		sourceIds : 'Main',
		consumptionNodeId : 11,
		consumptionSourceIds : 'Main'
	});
	sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.nodeUrlHelper(sn.env.consumptionNodeId);
	setup();
}
