/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.2
 * @require solarnetwork-util-aggcounter 0.0.2
 * @require solarnetwork-chart-gauge 0.0.2
 */

sn.config.debug = true;
sn.config.defaultTransitionMs = 600;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.globalCounter = sn.counter();
sn.runtime.excludeSources = new sn.Configuration();

function pixelWidth(selector) {
	if ( selector === undefined ) {
		return undefined;
	}
	var styleWidth = d3.select(selector).style('width');
	if ( !styleWidth ) {
		return null;
	}
	var pixels = styleWidth.match(/(\d+)px/);
	if ( pixels === null ) {
		return null;
	}
	var result = Number(pixels[1]);
	if ( isNaN(result) ) {
		return null;
	}
	return result;
}

/* chartParams:
{
	width: 812,
	height: 300,
	padding: [10,10,30,20], // top, right, bottom, left
}
*/
function energyIOAreaChart(containerSelector, chartParams) {
	var sources = [];
	var parameters = (chartParams || {});
	
	// default to container's width, if we can
	var containerWidth = pixelWidth(containerSelector);
	
	var p = (parameters.padding || [10, 10, 0, 25]),
		w = (parameters.width || containerWidth || 812) - p[1] - p[3],
		h = (parameters.height || 300) - p[0] - p[2],
    	x = d3.time.scale().range([0, w]),
		y = d3.scale.linear().range([h, 0]),
		format = d3.time.format("%H");

	var svgRoot = undefined,
		svg = undefined,
		clipId = undefined;
	
	// our layer data, and generator function
	var layerGenerator = undefined;
	var layers = undefined;
	
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
		computeUnitsY();
	}
	
	// Set y-axis  unit label
	// setup display units in kW if domain range > 1000
	var displayFactor = 1;
	var displayFormatter = d3.format(',d');
	function computeUnitsY() {
		var fmt;
		var domain = y.domain();
		var maxY = domain[domain.length - 1];
		if ( maxY >= 100000 ) {
			displayFactor = 1000000;
			fmt = ',g';
		} else if ( maxY >= 1000 ) {
			displayFactor = 1000;
			fmt = ',g';
		} else {
			displayFactor = 1;
			fmt = ',d';
		}
		displayFormatter = d3.format(fmt);
	}
	
	function displayFormat(d) {
		return displayFormatter(d / displayFactor);
	}

	function setup(rawData) {
		// turn filteredData object into proper array, sorted by date
		var dataArray = sn.powerPerSourceArray(rawData, sources);
		sn.log('Available area sources: {0}', sources);

		// Transpose the data into watt layers by source, e.g.
		// [ [{x:0,y:0},{x:1,y:1}...], ... ]
		layerGenerator = sn.powerPerSourceStackedLayerGenerator(sources, 'watts')
			.excludeSources(sn.runtime.excludeSources)
			.offset(sn.env.wiggle === 'true' ? 'wiggle' : 'zero')
			.data(dataArray);
		layers = layerGenerator();

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
		clipId = 'Clip' +sn.runtime.globalCounter.incrementAndGet();
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
				.attr("y", h + 10)
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
				.attr("x", p[3] - 10)
				.text(displayFormat);
		entered.transition().duration(sn.config.defaultTransitionMs)
				.style("opacity", 1);
	}

	return {
		sources : sources,
		
		xDomain : function() {
			return x.domain();
		},
		
		yDomain : function() {
			return y.domain();
		},
		
		yScale : function() {
			return displayFactor;
		},
		
		load : function(rawData) {
			setup(rawData);
			redraw();
			adjustAxisX();
			adjustAxisY();
		},
		
		regenerate: function() {
			if ( layerGenerator === undefined ) {
				// did you call load() first?
				return;
			}
			layers = layerGenerator();
			computeDomainY();
			svg.selectAll("g.source").data(layers);
			redraw();
			adjustAxisY();
		}
	};
}

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
		energyAreaChart = energyIOAreaChart('#day-watt', {
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
	sn.runtime.urlHelper = sn.nodeUrlHelper(sn.env.nodeId);
	sn.availableDataRange(sn.runtime.urlHelper, [sn.env.dataType]);
}
