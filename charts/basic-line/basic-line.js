/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-seasonal-dow-io 1.0.0
 */
sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

// show/hide the proper range selection based on the current aggregate level
function updateRangeSelection() {
	d3.selectAll('#details div.range').style('display', function() {
		return (d3.select(this).classed(sn.runtime.basicChartInfo.parameters.aggregate.toLowerCase()) ? 'block' : 'none');
	});
}

function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.key);
	d3.select(this).classed('disabled', sn.runtime.excludeSources.enabled(d.key));
	if ( sn.runtime.basicChartInfo !== undefined ) {
		sn.runtime.basicChartInfo.chart.regenerate();
		sn.ui.adjustDisplayUnits(sn.runtime.basicChartInfo.container, '', sn.runtime.basicChartInfo.chart.yScale());
	}
}

function sourceExcludeCallback(lineId) {
	return sn.runtime.excludeSources.enabled(lineId);
}

function setupBasicLineChart(container, chart, parameters, endDate, sourceMap) {
	var plotPropName = parameters.plotProperties[parameters.aggregate];
	var queryRange = sn.api.datum.loaderQueryRange(parameters.aggregate, sn.env, endDate);	
	var ignoreProps = { 'nodeId' : true };
	
	container.selectAll('.time-count').text(queryRange.timeCount);
	container.selectAll('.time-unit').text(queryRange.timeUnit);
	
	sn.api.datum.loader(sourceMap['Basic'], sn.runtime.urlHelper,  queryRange.start, queryRange.end, parameters.aggregate)
			.callback(function datumLoaderCallback(error, results) {
		if ( !Array.isArray(results) ) {
			sn.log("Unable to load data for Basic Line chart: {0}", error);
			return;
		}
		
		chart.reset();
		
		var dataBySource = d3.nest()
			.key(function(d) { return d.sourceId; })
			.sortKeys(d3.ascending)
			.entries(results);
			
		var loadedLineIds = [];
		
		dataBySource.forEach(function(sourceData) {
			// sourceData like { key : 'foo', values : [ ... ] }
			var templateObj = sourceData.values[0];
			
			// get properties of first object only
			var sourcePlotProperties = Object.keys(templateObj).filter(function(key) {
				return (!ignoreProps[key] && typeof templateObj[key] === 'number');
			});
			sourcePlotProperties.forEach(function(plotProp) {
				var p = sourceData.key + '-' + plotProp;
				chart.load(sourceData.values, p, plotProp);
				loadedLineIds.push(p);
			});
		});
		
		chart.regenerate();
		
		sn.log("Basic Line chart range: {0}", chart.yDomain());
		sn.log("Basic Line chart time range: {0}", chart.xDomain());
		sn.ui.adjustDisplayUnits(container, '', chart.yScale());
		
		var colors = chart.colorScale();
		var colorData = loadedLineIds.map(function(d, i) {
			return { 
				color : colors(i), 
				key : d,
				source : d.split('-', 2).join(' ')
			};
		});
		
		sn.ui.colorDataLegendTable('#source-labels', colorData, legendClickHandler);
	}).load();
}

function setupBasicLineChartForDate(endDate) {
	setupBasicLineChart(
		sn.runtime.basicChartInfo.container,
		sn.runtime.basicChartInfo.chart,
		sn.runtime.basicChartInfo.parameters,
		endDate,
		sn.runtime.sourceGroupMap);
}

function setupSourceGroupMap() {
	var map = {},
		sourceArray;
	sourceArray = sn.env.sourceIds.split(/\s*,\s*/);
	map['Basic'] = sourceArray;
	
	sn.runtime.sourceGroupMap = map;
}

function sourceSets(regenerate) {
	if ( !sn.runtime.sourceGroupMap || !sn.runtime.sourceSets || regenerate ) {
		setupSourceGroupMap();
		sn.runtime.sourceSets = [
			{ nodeUrlHelper : sn.runtime.urlHelper, 
				sourceIds : sn.runtime.sourceGroupMap['Basic'], 
				dataType : 'Basic' }
		];
	}
	return sn.runtime.sourceSets;
}

function setup(repInterval) {
	sn.runtime.reportableEndDate = repInterval.eDate;
	setupBasicLineChartForDate(sn.runtime.reportableEndDate);
	updateRangeSelection();
}

function setupUI() {
	d3.selectAll('.node-id').text(sn.env.nodeId);
	
	// update details form based on env
	d3.selectAll('#details input')
		.on('change', function(e) {
			var me = d3.select(this);
			var propName = me.attr('name');
			var getAvailable = false;
			if ( this.type === 'checkbox' ) {
				sn.env[propName] = me.property('checked');
			} else {
				sn.env[propName] = me.property('value');
			}
			if ( propName === 'nodeId' ) {
				sn.runtime.urlHelper = sn.api.node.nodeUrlHelper(sn.env[propName]);
				getAvailable = true;
			} else if ( propName === 'sourceIds' ) {
				getAvailable = true;
			}
			if ( getAvailable ) {
				sn.api.node.availableDataRange(sourceSets(true), function(reportableInterval) {
					delete sn.runtime.sourceColorMap; // to regenerate
					setup(reportableInterval);
				});
			} else {
				setupBasicLineChartForDate(sn.runtime.reportableEndDate);
			}
		}).each(function(e) {
			var input = d3.select(this);
			var name = input.attr('name');
			if ( sn.env[name] !== undefined ) {
				if ( input.property('type') === 'checkbox' ) {
					input.attr('checked', (sn.env[name] === 'true' ? 'checked' : null));
				} else {
					input.property('value', sn.env[name]);
				}
			}
		});

	// toggle between supported aggregate levels
	d3.select('#range-toggle').classed('clickable', true).on('click', function(d, i) {
		var me = d3.select(this);
		me.classed('hit', true);
		var currAgg = sn.runtime.basicChartInfo.chart.aggregate();
		sn.runtime.basicChartInfo.parameters.aggregate = (currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'Hour');
		setupBasicLineChartForDate(sn.runtime.reportableEndDate);
		setTimeout(function() {
			me.classed('hit', false);
		}, 500);
		updateRangeSelection();
	});
	
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 108,
		sourceIds : 'DB',
		numDays : 1,
		numMonths : 4,
		numYears : 2
	});
	sn.runtime.chartRefreshMs = 10 * 60 * 1000;

	sn.runtime.basicChartInfo = {
		parameters : new sn.Configuration({
						aggregate : 'Hour',
						plotProperties : {'Hour' : 'value'}
					}),
		container : d3.select(d3.select('#basic-line-chart').node().parentNode)
	};
	sn.runtime.basicChartInfo.chart = sn.chart.basicLineChart('#basic-line-chart', sn.runtime.basicChartInfo.parameters)
		.sourceExcludeCallback(sourceExcludeCallback);
	
	sn.runtime.urlHelper = sn.api.node.nodeUrlHelper(sn.env.nodeId);
	
	setupUI();
	sn.api.node.availableDataRange(sourceSets(), function(reportableInterval) {
		setup(reportableInterval);
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				sn.api.node.availableDataRange(sourceSets(), function(repInterval) {
					var jsonEndDate = repInterval.eDate;
					if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
						setup(repInterval);
					}
				});
			}, sn.runtime.chartRefreshMs);
		}
	});
}
