/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.2
 */

sn.config.debug = true;
sn.config.defaultTransitionMs = 600;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	if ( sn.runtime.powerMinuteChart !== undefined ) {
		sn.runtime.powerMinuteChart.regenerate();
		sn.adjustDisplayUnits(sn.runtime.powerMinuteContainer, 'W', sn.runtime.powerMinuteChart.yScale());
	}
	if ( sn.runtime.energyHourChart !== undefined ) {
		sn.runtime.energyHourChart.regenerate();
		sn.adjustDisplayUnits(sn.runtime.energyHourContainer, 'Wh', sn.runtime.energyHourChart.yScale());
	}
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

function colorForDataTypeSource(dataType, sourceId, sourceIndex) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.colorData[mappedSourceId];
}

function datumDate(datum) {
	if ( datum.date ) {
		return datum.date;
	}
	if ( datum.localDate ) {
		return sn.dateTimeFormat.parse(datum.localDate +' ' +datum.localTime);
	}
	if ( datum.created ) {
		return sn.timestampFormat.parse(datum.created);
	}
	return null;
}

function datumDayKey(datum) {
	if ( datum.localDate ) {
		return datum.localDate;
	}
	if ( datum.date ) {
		return (datum.date.getUTCFullYear() + '-' 
			+ (datum.date.getUTCMonth() < 9 ? '0' : '') + (datum.date.getUTCMonth()+1)
			+ (datum.date.getUTCDate() < 10 ? '0' : '') + datum.date.getUTCDate());
	}
	return null;
}

function chartDataCallback(dataType, datum) {
	var dayAgg = this.stashedData('dayAgg'),
		key,
		dayGroup;
	
	// create date property
	datum.date = datumDate(datum);
	
	key = datumDayKey(datum);
	if ( !key ) {
		return;
	}
	dayGroup = dayAgg[key];
	if ( !dayGroup ) {
		dayGroup = { key : key, sum : 0, count : 0 };
		dayAgg[key] = dayGroup;
	}
	if ( datum.wattHours ) {
		dayGroup.sum += datum.wattHours;
		dayGroup.count += 1;
	}
}

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.excludeSources.enabled(mappedSourceId);
}

function xAxisTickAggregateCallback(d, i, x, fmt) {
	var chart = this,
		dayAgg, dayGroup;
	if ( d.getUTCHours() === 12 ) {
		dayAgg = chart.stashedData('dayAgg');
		dayGroup = (dayAgg ? dayAgg[sn.dateFormat(d)] : undefined);
		// only show the aggregate value for days we have complete data for
		if ( dayGroup !== undefined && d3.time.day.utc.floor(d).getTime() >= x.domain()[0].getTime() ) {
			return String(d3.round(dayGroup.sum / chart.yScale(), 2));
		}
	}
	return fmt(d, i);
}

// Watt stacked area chart
function setupGroupedLayerChart(container, chart, parameters, endDate, sourceMap) {
	var queryRange = sn.datum.loaderQueryRange(parameters.aggregate, sn.env, endDate);
	var plotPropName = parameters.plotProperties[parameters.aggregate];
	
	container.selectAll('.time-count').text(queryRange.timeCount);
	container.selectAll('.time-unit').text(queryRange.timeUnit);
	
	sn.datum.multiLoader([
		sn.datum.loader(sourceMap[sn.env.dataType], sn.runtime.urlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate)
	]).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 1) ) {
			sn.log("Unable to load data for {0} chart: {1}", parameters.aggregate, error);
			return;
		}
		
		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		chart.reset()
			.stash({}, 'dayAgg')
			.load(results[0], sn.env.dataType)
			.regenerate();
		sn.adjustDisplayUnits(container, (parameters.aggregate === 'TenMinute' ? 'W' : 'Wh'), chart.yScale());
	}).load();
}

function setupSourceGroupMap() {
	var map = {},
		sourceArray;
	sourceArray = (Array.isArray(sn.env.sourceIds) ? sn.env.sourceIds : sn.env.sourceIds.split(/\s*,\s*/));
	map[sn.env.dataType] = sourceArray;
	
	sn.runtime.sourceGroupMap = map;
}

function sourceSets(regenerate) {
	if ( !sn.runtime.sourceGroupMap || regenerate ) {
		setupSourceGroupMap();
	}
	return [
		{ nodeUrlHelper : sn.runtime.urlHelper, sourceIds : sn.runtime.sourceGroupMap[sn.env.dataType] }
	];
}

function stackWattHourChart(rawData, containerSelector) {

	var sources = [];
	
	// turn filteredData object into proper array, sorted by date
	var dataArray = sn.powerPerSourceArray(rawData, sources);
	sn.log('Available bar sources: {0}', sources);
	
	var p = [10, 10, 30, 20], // top, right, bottom, left
		w = 844 - p[1] - p[3],
		h = 300 - p[0] - p[2],
		x = d3.time.scale().range([0, w]),
		y = d3.scale.linear().range([0, h]),
		format = d3.time.format("%H");
	var showYUnits = false;
	var ticks = undefined;
	
	var svgRoot = d3.select(containerSelector).select('svg');
	if ( svgRoot.empty() ) {
		svgRoot = d3.select(containerSelector).append('svg:svg')
			.attr('class', 'crisp chart')
			.attr("width", w + p[1] + p[3])
			.attr("height", h + p[0] + p[2]);
	} else {
		svgRoot.selectAll('*').remove();
	}

	svgRoot.append("g")
		.attr("class", "rule")
		.attr("transform", "translate(0," + (h + p[0]) + ")");
		
	// Transpose the data into 2D array of watt layers by source, e.g.
	// [ [{x:0,y:0},{x:1,y:1}...], ... ]
	var layerGenerator = sn.powerPerSourceStackedLayerGenerator(sources, 'wattHours')
		.excludeSources(sn.runtime.excludeSources)
		.data(dataArray);
	var layers = layerGenerator();
	
	// Create daily aggregated data, in form [ { date: Date(2011-12-02 12:00), wattHoursTotal: 12312 }, ... ]
	function calculateDailyAggregateWh() {
		var results = [];
		var i, j, len;
		var startIndex = undefined;
		var endIndex = undefined;
		var currDayData = undefined;
		var obj = undefined;
		var day1 = ticks[0];

		// calculate first x index for midnight
		for ( i = 0, len = layers[0].length; i < len; i++ ) {
			if ( layers[0][i].x.getHours() === 0 ) {
				startIndex = i;
				break;
			}
		}
		
		endIndex = layers[0].length;
		
		// sum up values for each day
		if ( startIndex !== undefined && endIndex !== undefined && startIndex < endIndex) {
			len = layers.length;
			for ( i = 0; i < endIndex; i++ ) {
				for ( j = 0; j < len; j++ ) {
					if ( sn.runtime.excludeSources[layers[j].source] !== undefined ) {
						continue;
					}
					obj = layers[j][i];
					if ( obj.x.getTime() < day1.getTime() ) {
						// skip before first tick
						continue;
					}
					if ( currDayData === undefined || obj.x.getDate() !== currDayData.date.getDate()
							|| obj.x.getMonth() !== currDayData.date.getMonth() 
							|| obj.x.getYear() !== currDayData.date.getYear() ) {
						currDayData = {date:new Date(obj.x.getTime()), wattHoursTotal:(i < startIndex ? null : 0)};
						currDayData.date.setHours(0,0,0,0);
						results.push(currDayData);
					}
					if ( i >= startIndex ) {
						currDayData.wattHoursTotal += obj.y;
					}
				}
			}
		}
		return results;
	}
	
	function computeDomainX() {
		// Add extra x domain to accommodate bar width, otherwise last bar is cut off right edge of chart
		var xMax = layers.domainX[1];
		xMax = new Date(xMax.getTime() + (xMax.getTime() - layers[0][layers[0].length - 2].x.getTime()));
		x.domain([layers.domainX[0], xMax]);
	}

	function computeDomainY() {
		y.domain([0, layers.maxY]).nice();
		sn.log("Wh max set to {0}", layers.maxY);
	}
	
	var barWidth = (layers[0].length === 0 ? 0 : (w / (layers[0].length)));
	
	computeDomainX();
	computeDomainY();

	ticks = x.ticks(d3.time.hours, 12);

	var dailyAggregateWh = calculateDailyAggregateWh();

	// setup clip path, so axis is crisp
	var clipId = 'Clip' +sn.runtime.globalCounter.incrementAndGet();
	svgRoot.append('clipPath')
			.attr('id', clipId)
		.append('rect')
			.attr('x', 0)
			.attr('y', -(h + p[0]))
			.attr('width', w)
			.attr('height', h + p[0]);

	var svg = svgRoot.append("g")
		.attr('class', 'data')
		.attr("transform", "translate(" + p[3] + "," + (h + p[0]) + ")");
	
	var aggGroup = svgRoot.append("g")
		.attr('class', 'agg')
		.attr("transform", "translate(" + p[3] + "," + (h + p[0]) + ")");
	
	// setup display units in kWh if domain range > 1000
	var displayUnits = 'Wh';
	var displayFactor = 1;
	var displayFormat = (function() {
		var fmt = ',d';
		var domain = y.domain();
		if ( domain[domain.length - 1] >= 1000 ) {
			displayUnits = 'kWh';
			displayFactor = 1000;
			fmt = ',g';
		}
		var fn = d3.format(fmt);
		return function(d) { return fn(d / displayFactor); };
	})();
	
	if ( showYUnits === true ) {
		// Add unit label
		svgRoot.append('text')
			.attr('class', 'label')
			.attr('transform', 'rotate(-90) translate(' +(Math.round(-h/2)-p[0]) +',12)')
			.text(displayUnits);
	}

	// Add date labels, centered within associated band
	svg.selectAll("text")
	  .data(ticks)
	.enter().append("text")
	  .attr("x", function(d) { return x(d) + (barWidth / 2); })
	  .attr("y", 6)
	  .attr("dy", ".71em")
	  .text(x.tickFormat(ticks.length));

	// x axis line, on top of chart
	svgRoot.append("g")
		.attr('class', 'crisp axis')
		.attr("transform", "translate(0," + (h + p[0]) + ")")
	.selectAll('line.axis')
		.data(y.ticks(5).filter(function(d, i) { return (i === 0); }))
	.enter().append('svg:line')
		.attr('class', 'axis')
		.attr('x1', p[3])
		.attr('x2', w + p[3])
		.attr('y1', function(d) { return y(d); })
		.attr('y2', function(d) { return y(d); });
	
	// Add a group for each source.
	var source = svg.selectAll("g.source")
			.data(layers)
		.enter().append("g")
			.attr("class", "source")
			.attr('clip-path', 'url(#' +clipId +')') // clip makes bottom nice and crisp
			.style("fill", sn.colorFn);
	
	// Add a rect for each date.
	source.selectAll("rect")
			.data(Object)
		.enter().append("rect")
			.attr("x", function(d) { return x(d.x); })
			.attr("y", 1e-6)
			.attr("height", 1e-6)
			.attr("width", barWidth);
	
	var axisXAggPosFn = function(d) { return x(d) + (barWidth / 2); };
	var axisXAggTextFn = function(d, i) { 
		return (i < dailyAggregateWh.length 
			? dailyAggregateWh[i].wattHoursTotal === null 
				? '' : Number(dailyAggregateWh[i].wattHoursTotal / displayFactor).toFixed(2)
			: 0);
	};
	
	adjustAxisY();
	adjustAxisXAggregate();
	redraw();
	
	function redraw() {
		source.selectAll("rect")
				.data(Object)
			.transition().duration(sn.config.defaultTransitionMs)
				.attr("y", function(d) { return -y(d.y0) - y(d.y); })
				.attr("height", function(d) { return y(d.y); });
	}
	
	function adjustAxisY() {
		var axisLines = svgRoot.select("g.rule").selectAll("g").data(y.ticks(5));
		axisLines.transition().duration(sn.config.defaultTransitionMs)
				.attr("transform", function(d) { return "translate(0," + -y(d) + ")"; })
			.select("text")
				.text(displayFormat);
		
	  	axisLines.exit().transition().duration(sn.config.defaultTransitionMs)
	  			.style("opacity", 1e-6)
	  			.remove();
	  			
		var entered = axisLines.enter()
				.append("g")
				.style("opacity", 1e-6)
	  			.attr("transform", function(d) { return "translate(0," + -y(d) + ")"; });
	  	entered.append("line")
				.attr("x2", w + p[3])
				.attr('x1', p[3]);
		entered.append("text")
				.attr("x", p[3])
				.attr('dx', -5)
				.attr("text-anchor", "end")
				.attr("dy", ".35em")
				.text(displayFormat);
		entered.transition().duration(sn.config.defaultTransitionMs)
				.style("opacity", 1);
	}
	
	function adjustAxisXAggregate() {
		// Add daily aggregate labels, centered within associated band at noon
		var aggTicks = ticks.filter(function(d) { return d.getHours() === 12; });
		var aggLabels = aggGroup.selectAll("text").data(aggTicks);
		
		aggLabels.transition().duration(sn.config.defaultTransitionMs)
				.attr("x", axisXAggPosFn)
				.text(axisXAggTextFn);
			
		aggLabels.exit().transition().duration(sn.config.defaultTransitionMs)
	  			.style("opacity", 1e-6)
	  			.remove();

		aggLabels.enter().append("text")
				.attr("x", axisXAggPosFn)
				.attr("y", 22)
				.attr("dy", ".71em")
				.style("opacity", 1e-6)
				.text(axisXAggTextFn)
			.transition().duration(sn.config.defaultTransitionMs)
				.style("opacity", 1);
	}
	
	return {
		yScale : function() {
			return displayFactor;
		},
		
		sources: sources,
		
		xDomain: function() {
			return x.domain();
		},
		
		regenerate: function() {
			layers = layerGenerator();
			dailyAggregateWh = calculateDailyAggregateWh();
			computeDomainY();
			svg.selectAll("g.source").data(layers);
			redraw();
			adjustAxisY();
			adjustAxisXAggregate();
		}
	};
}

function areaWattChart(rawData, containerSelector) {
	var sources = [];
	var p = [10, 10, 30, 20], // top, right, bottom, left padding
		w = 844 - p[1] - p[3],
		h = 300 - p[0] - p[2],
    	x = d3.time.scale().range([0, w]),
		y = d3.scale.linear().range([h, 0]),
		format = d3.time.format("%H");
	var showYUnits = false;
	var svgRoot = undefined,
		svg = undefined;

	// turn filteredData object into proper array, sorted by date
	var dataArray = sn.powerPerSourceArray(rawData, sources);
	sn.log('Available area sources: {0}', sources);

	// Transpose the data into watt layers by source, e.g.
	// [ [{x:0,y:0},{x:1,y:1}...], ... ]
	var layerGenerator = sn.powerPerSourceStackedLayerGenerator(sources, 'watts')
		.excludeSources(sn.runtime.excludeSources)
		.offset(sn.env.wiggle === 'true' ? 'wiggle' : 'zero')
		.data(dataArray);
	var layers = layerGenerator();
		
	function strokeColorFn(d, i) { return d3.rgb(sn.colorFn(d,i)).darker(); }

	var areaPathGenerator = d3.svg.area()
		.interpolate("monotone")
		.x(function(d) { return x(d.x); })
		.y0(function(d) { return y(d.y0); })
		.y1(function(d) { return y(d.y0 + d.y); });
	
	function computeDomainX() {
		x.domain(layers.domainX);
	}

	function computeDomainY() {
		y.domain([0, layers.maxY]).nice();
		sn.log("W max set to {0}", layers.maxY);
	}

	// Compute the x-domain (by date) and y-domain (by top).
	computeDomainX();
	computeDomainY();

	svgRoot = d3.select(containerSelector).select('svg');
	if ( svgRoot.empty() ) {
		svgRoot = d3.select(containerSelector).append('svg:svg')
			.attr('class', 'chart')
			.attr("width", w + p[1] + p[3])
			.attr("height", h + p[0] + p[2]);
			//.attr("pointer-events", "all")
   			//.call(d3.behavior.zoom().on("zoom", redraw));
	} else {
		svgRoot.selectAll('*').remove();
	}

	svgRoot.append("g")
		.attr("class", "crisp rule")
		.attr("transform", "translate(0," + p[0] + ")");
	
	// setup clip path, so axis is crisp
	var clipId = 'Clip' +sn.runtime.globalCounter.incrementAndGet();
	svgRoot.append('svg:clipPath')
			.attr('id', clipId)
		.append('svg:rect')
			.attr('x', 0)
			.attr('y', -p[0])
			.attr('width', w)
			.attr('height', h + p[0]);

	svg = svgRoot.append("g")
		.attr('class', 'data')
		.attr("transform", "translate(" + p[3] + "," + p[0] + ")");
	
	// Set y-axis  unit label
	// setup display units in kW if domain range > 1000
	var displayUnits = 'W';
	var displayFactor = 1;
	var displayFormat = (function() {
		var fmt = ',d';
		var domain = y.domain();
		if ( domain[domain.length - 1] >= 1000 ) {
			displayUnits = 'kW';
			displayFactor = 1000;
			fmt = ',g';
		}
		var fn = d3.format(fmt);
		return function(d) { return fn(d / displayFactor); };
	})();
	
	if ( showYUnits === true ) {
		svgRoot.selectAll('text.unit')
			.data([1])
				.text(displayUnits)
			.enter().append('text')
				.attr('class', 'unit label')
				.attr('transform', 'rotate(-90) translate(' +(Math.round(-h/2)-p[0]) +',12)')
				.text(displayUnits);
	}
	
	function redraw() {	
		// draw data areas
		var area = svg.selectAll("path.area").data(layers);
		
		area.transition().duration(sn.config.defaultTransitionMs).delay(200)
				.attr("d", areaPathGenerator);
		
		area.enter().append("path")
				.attr("class", "area")
				.attr('clip-path', 'url(#' +clipId +')')
				.style("fill", sn.colorFn)
				.attr("d", areaPathGenerator);
		
		area.exit().remove();
	}

	function axisYTransform(d) { return "translate(0," + y(d) + ")"; };

	function adjustAxisX() {
		if ( d3.event && d3.event.transform ) {
			d3.event.transform(x);
		}
		var numTicks = 12;
		var fx = x.tickFormat(numTicks);
		var ticks = x.ticks(numTicks);

		// Generate x-ticks
		var gx = svg.selectAll("g.data text")
			.data(ticks)
				.attr("x", x)
				.text(fx);
		gx.enter().append("text")
				.attr("x", x)
				.attr("y", h + 6)
				.attr("dy", ".71em")
				.text(fx);
		gx.exit().remove();
	}

	function adjustAxisY() {
		if ( sn.env.wiggle === 'true' ) {
			return;
		}

		var axisLines = svgRoot.select("g.rule").selectAll("g").data(y.ticks(5));
		axisLines.transition().duration(sn.config.defaultTransitionMs)
				.attr("transform", axisYTransform)
			.select("text")
				.text(displayFormat);
		
	  	axisLines.exit().transition().duration(sn.config.defaultTransitionMs)
	  			.style("opacity", 1e-6)
	  			.remove();
	  			
		var entered = axisLines.enter()
				.append("g")
				.style("opacity", 1e-6)
	  			.attr("transform", axisYTransform);
	  	entered.append("line")
				.attr("x2", w + p[3])
				.attr('x1', p[3]);
		entered.append("text")
				.attr("x", p[3])
				.attr('dx', -5)
				.attr("text-anchor", "end")
				.attr("dy", ".35em")
				.text(displayFormat);
		entered.transition().duration(sn.config.defaultTransitionMs)
				.style("opacity", 1);
	}

	redraw();
	adjustAxisX();
	adjustAxisY();
		
	return {
		yScale : function() {
			return displayFactor;
		},
		
		sources: sources,
		
		xDomain: function() {
			return x.domain();
		},
		
		regenerate: function() {
			layers = layerGenerator();
			computeDomainY();
			svg.selectAll("g.source").data(layers);
			redraw();
			adjustAxisY();
		}
	};
}

function updateReadings() {
	d3.json(sn.runtime.urlHelper.mostRecentURL(sn.runtime.sourceGroupMap[sn.env.dataType]), function(json) {
		if ( !(json && json.data && Array.isArray(json.data.results)) ) {
			sn.log('No data available for node {0}', sn.runtime.urlHelper.nodeId);
			return;
		}
		// totalPower, in kW
		var totalPower = d3.sum(json.data.results, function(d) { 
			return (d.watts ? d.watts : 0);
		}) / 1000;
		d3.select('#total-power-value').html(Number(totalPower).toFixed(2));
	});
}

function setup(repInterval) {
	sn.runtime.reportableEndDate = repInterval.eDate;
	if ( sn.runtime.sourceColorMap === undefined ) {
		sn.runtime.sourceColorMap = sn.sourceColorMapping(sn.runtime.sourceGroupMap);
	
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

	setupGroupedLayerChart(sn.runtime.powerMinuteContainer, 
		sn.runtime.powerMinuteChart, 
		sn.runtime.powerMinuteParameters, 
		sn.runtime.reportableEndDate, 
		sn.runtime.sourceGroupMap);
	
	setupGroupedLayerChart(sn.runtime.energyHourContainer,
		sn.runtime.energyHourChart,
		sn.runtime.energyHourParameters,
		sn.runtime.reportableEndDate,
		sn.runtime.sourceGroupMap);

	// every minute update reading values
	if ( sn.runtime.updateTimer === undefined ) {
		updateReadings();
		sn.runtime.updateTimer = setInterval(updateReadings, 60 * 1000);
	}

	/*
	var endDate = repInterval.eDate;
	var whChart = undefined;
	var wChart = undefined;

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
	
	// adjust display units as needed
	function adjustChartDisplayUnits(chartKey, baseUnit, scale) {
		var unit = (scale === 1000 ? 'k' : '') + baseUnit;
		d3.selectAll(chartKey +' .unit').text(unit);
	}
	
	var e = new Date(endDate.getTime());
	e.setMinutes(0,0,0); // truncate to nearest hour

	// Wh chart, agg by hour
	var whRange = [
			new Date(e.getTime() - ((sn.env.numDays * 24 - 1) * 60 * 60 * 1000)),
			new Date(e.getTime())
		];
	d3.json(sn.runtime.urlHelper.dateTimeQuery(sn.env.dataType, whRange[0], whRange[1], 'Hour'), function(json) {
		whChart = stackWattHourChart(json.data, '#week-watthour');
		adjustChartDisplayUnits('.watthour-chart', 'Wh', whChart.yScale());
	});

	// Watt stacked area chart
	function wattChartSetup(endDate) {
		var e = new Date(endDate.getTime());
		// truncate end date to nearest day precision minutes
		e.setMinutes((endDate.getMinutes() - (endDate.getMinutes() % sn.env.minutePrecision)), 0, 0);
		
		var wRange = [
			new Date(e.getTime() - (sn.env.numHours * 60 * 60 * 1000)), 
			new Date(e.getTime())
			];
		d3.json(sn.runtime.urlHelper.dateTimeQuery(sn.env.dataType, wRange[0], wRange[1], sn.env.minutePrecision), function(json) {
			wChart = areaWattChart(json.data, '#day-watt');
			adjustChartDisplayUnits('.watt-chart', 'W', wChart.yScale());
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
			wChart = wattChartSetup(endDate);
			if ( whChart !== undefined ) {
				var xDomain = whChart.xDomain();
				var currEndDate = xDomain[xDomain.length - 1];
				var newEndDate = new Date(endDate.getTime());
				currEndDate.setMinutes(0,0,0); // truncate to nearest hour
				newEndDate.setMinutes(0,0,0);
				if ( newEndDate.getTime() > currEndDate.getTime() ) {
					d3.json(sn.runtime.urlHelper.dateTimeQuery(sn.env.dataType, new Date(newEndDate.getTime() - ((sn.env.numDays * 24 - 1) * 60 * 60 * 1000)), newEndDate, 'Hour'), function(json) {
						whChart = stackWattHourChart(json.data, '#week-watthour');
					});
				}
			}
		});
	}, sn.config.wChartRefreshMs);
	
	function legendClickHandler(d, i) {
		sn.runtime.excludeSources.toggle(d.source);
		if ( whChart !== undefined ) {
			whChart.regenerate();
			adjustChartDisplayUnits('.watthour-chart', 'Wh', whChart.yScale());
		}
		if ( wChart !== undefined ) {
			// use a slight delay, otherwise transitions can be jittery
			setTimeout(function() {
				wChart.regenerate();
				adjustChartDisplayUnits('.watt-chart', 'W', wChart.yScale());
			}, sn.config.defaultTransitionMs * .8);
		}
	}
	*/
}

function setupUI() {
	d3.selectAll('.node-id').text(sn.env.nodeId);
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
	d3.selectAll('.total-power .dataType').text((function() {
		if ( sn.env.dataType === 'Consumption' ) {
			return 'Use';
		}
		return 'Power';
	})());
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 11,
		sourceIds : 'Main',
		dataType : 'Consumption',
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		wiggle : 'true',
		linkOld : false
	});
	
	sn.runtime.wChartRefreshMs = sn.env.minutePrecision * 60 * 1000;

	sn.runtime.powerMinuteContainer = d3.select(d3.select('#day-watt').node().parentNode);
	sn.runtime.powerMinuteParameters = new sn.Configuration({
		aggregate : 'TenMinute',
		wiggle : (sn.env.wiggle === 'true'),
		plotProperties : {TenMinute : 'watts', Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.powerMinuteChart = sn.chart.powerAreaChart('#day-watt', sn.runtime.powerMinuteParameters)
		.colorCallback(colorForDataTypeSource)
		.dataCallback(chartDataCallback)
		.sourceExcludeCallback(sourceExcludeCallback);
		
	sn.runtime.energyHourContainer = d3.select(d3.select('#week-watthour').node().parentNode);
	sn.runtime.energyHourParameters = new sn.Configuration({
		aggregate : 'Hour',
		plotProperties : {Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.energyHourChart = sn.chart.energyBarOverlapChart('#week-watthour', sn.runtime.energyHourParameters)
		.colorCallback(colorForDataTypeSource)
		.dataCallback(chartDataCallback)
		.xAxisTickCallback(xAxisTickAggregateCallback)
		.sourceExcludeCallback(sourceExcludeCallback);

	sn.runtime.urlHelper = sn.datum.nodeUrlHelper(sn.env.nodeId);

	setupUI();
	
	// get available sources, followed by available data range
	function getRangeForSources(error, sourceIds) {
		if ( Array.isArray(sourceIds) === false ) {
			return;
		}
		sn.env.sourceIds = sourceIds;
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
	if ( sn.env.sourceIds.length > 0 ) {
		getRangeForSources(null, sn.env.sourceIds.split(/\s*,\s*/));
	} else {
		sn.datum.availableSources(sn.runtime.urlHelper, getRangeForSources);
	}
}
