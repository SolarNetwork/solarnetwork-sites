var sn = {
	colors : {
		steelblue: ['#356287', '#4682b4', '#6B9BC3', '#89AFCF', '#A1BFD9', '#B5CDE1', '#DAE6F0'],
		triplets: (function() {
			var baseColors = ['#356287', '#007236', '#a3620a', '#9e0b0f', '#603913', '#aba000'];
			//var baseColors = ['#2e82cc', '#f0d400', '#35b3ac', '#f1264e', '#36d120', '#c42db6'];
			//var baseColors = ['#00af7b', '#00af7b', '#ffd900', '#009acb', '#000000', '#c98286'];
			var result = [];
			var i, j;
			var color;
			for ( i = 0; i < baseColors.length; i++ ) {
				result.push(baseColors[i]);
				color = d3.rgb(baseColors[i]);
				for ( j = 0; j < 2; j++ ) {
					color = color.brighter();
					result.push(color.toString());
				}
			}
			return result;
		})()
	},
	env : {
		host : 'data.solarnetwork.net',
		path : '/solarquery',
		nodeId : 37,
		dataType : 'Consumption',
		dayPrecision : 10,
		numHours : 24,
		numDays : 7,
		wiggle : 'true'
	},
	runtime : {},
	
	dateTimeFormat : d3.time.format("%Y-%m-%d %H:%M"),
	
	dateFormat : d3.time.format("%Y-%m-%d"),
	
	// fmt(string, args...): helper to be able to use placeholders even on iOS, where console.log doesn't support them
	fmt : function() {
		var formatted = arguments[0];
		for (var i = 1; i < arguments.length; i++) {
			var regexp = new RegExp('\\{'+(i-1)+'\\}', 'gi');
			formatted = formatted.replace(regexp, arguments[i]);
		}
		return formatted;
	},
	
	log : function() {
		if ( console !== undefined ) {
			console.log(sn.fmt.apply(this, arguments));
		}
	},
	
	urlHelper : function(nodeId) {
		var helper = {
			nodeId : function() { return nodeId; },
			
			reportableInterval : function(types) {
				var t = (Array.isArray(types) && types.length > 0 ? types : ['Power']);
				var url = 'http://' +sn.env.host +sn.env.path +'/reportableInterval.json?nodeId=' +nodeId;
				t.forEach(function(el) {
					url += '&types=' +encodeURIComponent(el);
				});
				return url;
			},
			
			availableSources : function(types, startDate, endDate) {
				var t = (Array.isArray(types) && types.length > 0 ? types : ['Power']);
				var url = 'http://' +sn.env.host +sn.env.path +'/availableSources.json?nodeId=' +nodeId;
				t.forEach(function(el) {
					url += '&types=' +encodeURIComponent(el);
				});
				if ( startDate !== undefined ) {
					url += '&start=' +encodeURIComponent(sn.dateFormat(startDate));
				}
				if ( endDate !== undefined ) {
					url += '&end=' +encodeURIComponent(sn.dateFormat(endDate));
				}
				return url;
			},
			
			dateTimeQuery : function(type, startDate, endDate, agg) {
				var dataURL = 'http://' +sn.env.host +sn.env.path +'/' +type.toLowerCase() +'Data.json?nodeId=' +nodeId +'&startDate='
					+encodeURIComponent(sn.dateTimeFormat(startDate))
					+'&endDate='
					+encodeURIComponent(sn.dateTimeFormat(endDate));
				var aggNum = Number(agg);
				if ( !isNaN(agg) ) {
					dataURL += '&precision=' +aggNum.toFixed(0);
				} else if ( typeof agg === 'string' && agg.length > 0 ) {
					dataURL += '&aggregate=' + encodeURIComponent(agg);
				}
				return dataURL;
			},
			
			mostRecentQuery : function(type) {
				return ('http://' +sn.env.host +sn.env.path +'/' +type.toLowerCase() +'Data.json?nodeId=' +nodeId +'&mostRecent=true');
			}
		};
		
		return helper;
	},
	
	counter : function() {
		var c = 0;
		var obj = function() {
			return c;
		};
		obj.incrementAndGet = function() {
			c++;
			return c;
		};
		return obj;
	},
	
	colorData : function(fillColors, sources) {
		var colorRange = d3.scale.ordinal().range(fillColors);
		var colorData = sources.map(function(el, i) { return {source:el, color:colorRange(i)}; })
		
		// also provide a mapping of sources to corresponding colors
		var i, len;
		for ( i = 0, len = colorData.length; i < len; i++ ) {
			colorData[colorData[i].source] = colorData[i].color;
		}
		
		return colorData;
	}
	
};

sn.globalCounter = sn.counter();

/**
 Take SolarNetwork raw JSON data result and return a d3-friendly normalized array of data.
 The 'sources' parameter should be an empty Array, which will be populated with the list
 of found sourceId values from the raw JSON data. 
 
 rawData sample format:
 [
	{
		"batteryVolts" : -1.0,
		"cost" : -1.0,
		"currency" : "",
		"localDate" : "2011-12-02",
		"localTime" : "12:00",
		"sourceId" : "Main",
		"wattHours" : 470.0,
		"watts" : 592
  	}
  ]
  	
  Returned data sample format:
  
  [
		{
			date       : Date(2011-12-02 12:00),
			Main       : { watts: 592, wattHours: 470 },
			Secondary  : { watts: 123, wattHours: 312 },
			_aggregate : { wattHoursTotal: 782 }
		}
  ]

 */
sn.powerDataArray = function(rawData, sources) {
	var filteredData = {};
	rawData.forEach(function(el, i) {
		var dateStr = el.localDate +' ' +el.localTime;
		var d = filteredData[dateStr];
		if ( d === undefined ) {
			d = {date:sn.dateTimeFormat.parse(dateStr)};
			filteredData[dateStr] = d;
		}
		
		// if there is no data for the allotted sample, watts === -1, so don't treat
		// that sample as a valid source ID
		var sourceName = el.sourceId;
		if ( sourceName === undefined || sourceName === '' ) {
			// default to Main if 
			sourceName = 'Main';
		}
		if ( el.watts !== -1 && sourceName !== 'date' && sourceName.charAt(0) !== '_' ) {
			if ( sources.indexOf(sourceName) < 0 ) {
				sources.push(sourceName);
			}
			d[sourceName] = {watts:el.watts, wattHours:el.wattHours};
			if ( el.wattHours > 0 ) {
				if ( d['_aggregate'] === undefined ) {
					d['_aggregate'] = { wattHoursTotal: el.wattHours };
				} else {
					d['_aggregate'].wattHoursTotal += el.wattHours;
				}
			}
		}
	});
	
	// sort sources
	sources.sort();
	
	var prop = undefined;
	var a = [];
	for ( prop in filteredData ) {
		a.push(filteredData[prop]);
	}
	return a.sort(function(left,right) {
		var a = left.date.getTime();
		var b = right.date.getTime(); 
		return (a < b ? -1 : a > b ? 1 : 0);
	});
};

function stackWattHourChart(rawData, containerSelector) {

	var sources = [];
	
	// turn filteredData object into proper array, sorted by date
	var dataArray = sn.powerDataArray(rawData, sources);
	sn.log('Available sources: {0}', sources);
	
	/* create daily aggregated data, in form
	   [
	     { 
	       date: Date(2011-12-02 12:00),
	       wattHoursTotal: 12312
	     },
	     ...
	   ]
	*/
	  
	var dailyData = [];
	var currDayData = undefined;
	dataArray.forEach(function(e) {
		if ( (currDayData === undefined // at the start of data, only start tallying if before noon, as labels on noon
				&& e.date.getHours() < 13) 
			|| (currDayData !== undefined && 
				(e.date.getDate() !== currDayData.date.getDate()
				|| e.date.getMonth() !== currDayData.date.getMonth() 
				|| e.date.getYear() !== currDayData.date.getYear())) ) {
			currDayData = {date:new Date(e.date.getTime()), wattHoursTotal:0};
			currDayData.date.setHours(0,0,0,0);
			dailyData.push(currDayData);
		}
		if ( currDayData !== undefined && e['_aggregate'] !== undefined ) {
			currDayData.wattHoursTotal += e['_aggregate'].wattHoursTotal;
		}
	});
	
	var p = [20, 0, 30, 50],
		w = 890 - p[1] - p[3],
		h = 300 - p[0] - p[2],
		x = d3.time.scale().range([0, w]),
		y = d3.scale.linear().range([0, h]),
		format = d3.time.format("%H");
	
	var svgRoot = d3.select(containerSelector).select('svg');
	if ( svgRoot.empty() ) {
		svgRoot = d3.select(containerSelector).append('svg:svg')
			.attr('class', 'crisp chart')
			.attr("width", w + p[1] + p[3])
			.attr("height", h + p[0] + p[2]);
	} else {
		svgRoot.selectAll('*').remove();
	}

	var rule = svgRoot.append("g")
		.attr('class', 'rule')
		.attr("transform", "translate(0," + (h + p[0]) + ")");
		
	// Transpose the data into wattHour layers by source.
	var layers = d3.layout.stack()(sources.map(function(source) {
		return dataArray.map(function(d) {
		  return {
		  	x: d.date, 
		  	y: (d[source] !== undefined ? +d[source].wattHours : 0),
		  	source: source // add this so can consistently map color later
		  };
		});
	}));
	
	var barWidth = (layers[0].length == 0 ? 0 : (w / (layers[0].length)));
	
	// Compute the x-domain (by date) and y-domain (by top).
	// Add extra x domain to accommodate bar width, otherwise last bar is cut off right edge of chart
	var xMax = layers[0][layers[0].length - 1].x;
	xMax = new Date(xMax.getTime() + (xMax.getTime() - layers[0][layers[0].length - 2].x.getTime()));
	x.domain([layers[0][0].x, xMax]);
	y.domain([0, d3.max(layers[layers.length - 1], function(d) { return d.y0 + d.y; })]);

	// setup clip path, so axis is crisp
	var clipId = 'Clip' +sn.globalCounter.incrementAndGet();
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
	
	// Add unit label
	svgRoot.append('text')
		.attr('class', 'label')
		.attr('transform', 'rotate(-90) translate(' +(Math.round(-h/2)-p[0]) +',12)')
		.text(displayUnits);

	var ticks = x.ticks(d3.time.hours, 12);

	// Add date labels, centered within associated band
	svg.selectAll("text")
	  .data(ticks)
	.enter().append("text")
	  .attr("x", function(d) { return x(d) + (barWidth / 2); })
	  .attr("y", 6)
	  .attr("dy", ".71em")
	  .text(x.tickFormat(ticks.length));

	// Add daily aggregate labels, centered within associated band at noon
	var aggTicks = ticks.filter(function(d) { return d.getHours() === 12; });
	aggGroup.selectAll("text")
	  .data(aggTicks)
	.enter().append("text")
	  .attr("x", function(d) { return x(d) + (barWidth / 2); })
	  .attr("y", 22)
	  .attr("dy", ".71em")
	  .text(function(d, i) { return Number(dailyData[i].wattHoursTotal / displayFactor).toFixed(2) });
	
	// Add y-axis rules groups, translated to y tick positions
	rule = rule.selectAll("g")
	  .data(y.ticks(5))
	.enter().append("g")
	  .attr("transform", function(d) { return "translate(0," + -y(d) + ")"; });
	
	// Add y-axis rules
	rule.append("line")
	  .attr("x2", w + p[3])
	  .attr('x1', p[3]);
	
	// Add y-axis labels
	rule.append("text")
	  .attr("x", p[3])
	  .attr('dx', -5)
	  .attr("text-anchor", "end")
	  .attr("dy", ".35em")
	  .text(displayFormat);

	// Add a group for each source.
	var source = svg.selectAll("g.source")
			.data(layers)
		.enter().append("g")
			.attr("class", "source")
			.attr('clip-path', 'url(#' +clipId +')') // clip makes bottom nice and crisp
			.style("fill", function(d, i) { 
				return sn.runtime.colorData[d[i].source]; 
			});
	
	// Add a rect for each date.
	source.selectAll("rect")
			.data(Object)
		.enter().append("rect")
			.attr("x", function(d) { return x(d.x); })
			.attr("y", function(d) { return -y(d.y0) - y(d.y); })
			.attr("height", function(d) { return y(d.y); })
			.attr("width", barWidth);
	
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
		
	return {
		sources: sources,
		
		xDomain: function() {
			return x.domain();
		},
		
		update : function(updateData) {
			var updatedDataArray = sn.powerDataArray(updateData, []);
			var updatedLayers = d3.layout.stack()(sources.map(function(source) {
				return updatedDataArray.map(function(d) {
				  return {x: d.date, y: (d[source] !== undefined ? +d[source].wattHours : 0)};
				});
			}));
			
			// recompute layers
			layers.forEach(function(el, i) {
				el.shift();
				updatedLayers[i].forEach(function(n) { el.push(n); });
			});
			
			// Compute the x-domain (by date) and y-domain (by top).
			x.domain(layers[0].map(function(d) { return d.x; }));

			var source = svg.selectAll("g.source")
					.data(layers);
			var rect = source.selectAll('rect')
					.data(Object, function(d) { return d.x; });
			rect.enter().insert('rect')
				  .attr("x", function(d) { return x(d.x); })
				  .attr("y", function(d) { return -y(d.y0) - y(d.y); })
				  .attr("height", function(d) { return y(d.y); })
				  .attr("width", x.rangeBand())
				.transition()
					.duration(1000)
					.attr("x", function(d, i) { return x(d.x); });
					
			rect.transition()
				.duration(1000)
				.attr("x", function(d, i) { return x(d.x); });
				
			rect.exit().transition()
				.duration(1000)
				.attr("x", function(d, i) { return x(d.x, i-1); })
				.remove();

		}
	};
}

function areaWattChart(rawData, containerSelector) {
	var sources = [];
	
	// turn filteredData object into proper array, sorted by date
	var dataArray = sn.powerDataArray(rawData, sources);
	sn.log('Available sources: {0}', sources);
	
	var p = [20, 0, 30, 50], // top, right, bottom, left padding
		w = 818 - p[1] - p[3],
		h = 300 - p[0] - p[2],
    	x = d3.time.scale().range([0, w]),
		y = d3.scale.linear().range([h, 0]),
		format = d3.time.format("%H");

	//var tx = function(d) { return "translate(" + x(d) + ",0)"; };
		
	var svgRoot = undefined,
		svg = undefined,
		layers = undefined,
		rule = undefined;
		
	var strokeFn = function(d, i) { return d3.rgb(sn.runtime.colorData[d[i].source]).darker(); };

	var redrawData = function() {
		// Add an area for each date.
		var area = svg.selectAll("path.area")
			.data(layers);
			
		area.enter().append("path")
			.attr("class", "area")
			.attr('clip-path', 'url(#' +clipId +')')
			.style("fill", function(d, i) { return sn.runtime.colorData[d[i].source]; })
			.attr("d", d3.svg.area()
				.interpolate("monotone")
				.x(function(d) { return x(d.x); })
				.y0(function(d) { return y(d.y0); })
				.y1(function(d) { return y(d.y0 + d.y); }));
		
		area.style("fill", function(d, i) { return sn.runtime.colorData[d[i].source]; })
			.attr("d", d3.svg.area()
				.interpolate("monotone")
				.x(function(d) { return x(d.x); })
				.y0(function(d) { return y(d.y0); })
				.y1(function(d) { return y(d.y0 + d.y); }));
	
		area.exit().remove();
		
		// Add a line for each date.
		var outline = svg.selectAll("path.line")
			.data(layers);
		
		outline.enter().append("path")
				.attr("class", "line")
				.attr('clip-path', 'url(#' +clipId +')')
				.style("stroke", strokeFn)
				.style("stroke-width", "0.66px")
				.attr("d", d3.svg.line()
					.interpolate("monotone")
					.x(function(d) { return x(d.x); })
					.y(function(d) { return y(d.y0 + d.y); }));
					
		outline
			.style("stroke", strokeFn)
			.style("stroke-width", "0.66px")
			.attr("d", d3.svg.line()
				.interpolate("monotone")
				.x(function(d) { return x(d.x); })
				.y(function(d) { return y(d.y0 + d.y); }))
				
		outline.exit().remove();
	};

	var redraw = function() {
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
		var gxe = gx.enter()
			.append("text")
				.attr("x", x)
				.attr("y", h + 6)
				.attr("dy", ".71em")
				.text(fx);
		gx.exit().remove();
		
		// only draw y-axis if not in wiggle mode
		if ( sn.env.wiggle !== 'true' ) {	
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
	
			// Set y-axis  unit label
			svgRoot.selectAll('text.unit')
				.data([1])
					.text(displayUnits)
				.enter().append('text')
					.attr('class', 'unit label')
					.attr('transform', 'rotate(-90) translate(' +(Math.round(-h/2)-p[0]) +',12)')
					.text(displayUnits);
					
	
			// Regenerate y-ticks…
			var gy = rule.selectAll("g.y")
				.data(y.ticks(5))
				.attr("transform", function(d) { return "translate(0," + y(d) + ")"; });
		
			gy.select("text")
				.text(displayFormat);
		
			var gye = gy.enter().insert("svg:g")
				.attr("class", "y")
				.attr("transform", function(d) { return "translate(0," + y(d) + ")"; });
		
			gye.append("svg:line")
				  .attr("x2", w + p[3])
				  .attr('x1', p[3]);
		
			gye.append("svg:text")
				  .attr("x", p[3])
				  .attr('dx', -5)
				  .attr("text-anchor", "end")
				  .attr("dy", ".35em")
				  .text(displayFormat);
			  
			gy.exit().remove();
		}
		
		redrawData();
	};

	svgRoot = d3.select(containerSelector).select('svg');
	if ( svgRoot.empty() ) {
		svgRoot = d3.select(containerSelector).append('svg:svg')
			.attr('class', 'chart')
			.attr("width", w + p[1] + p[3])
			.attr("height", h + p[0] + p[2])
			.attr("pointer-events", "all")
   			.call(d3.behavior.zoom().on("zoom", redraw));
	} else {
		svgRoot.selectAll('*').remove();
	}

	rule = svgRoot.append("g")
		.attr('class', 'crisp rule')
		.attr("transform", "translate(0," + p[0] + ")");
	
	// setup clip path, so axis is crisp
	var clipId = 'Clip' +sn.globalCounter.incrementAndGet();
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
	
	// Transpose the data into wattHour layers by source.
	var stackLayoutFn = d3.layout.stack();
	if ( sn.env.wiggle === 'true' ) {
		stackLayoutFn = stackLayoutFn.offset('wiggle');
	}
	layers = stackLayoutFn(sources.map(function(source) {
		return dataArray.map(function(d) {
		  return {
		  	x: d.date, 
		  	y: (d[source] !== undefined ? +d[source].watts : 0),
		  	source: source
		  };
		});
	}));
	
	// Compute the x-domain (by date) and y-domain (by top).
	x.domain([layers[0][0].x, layers[0][layers[0].length - 1].x]);
	y.domain([0, d3.max(layers[layers.length - 1], function(d) { return d.y0 + d.y; })]);

	redraw();
	
	return {
		sources: sources,
		
		xDomain: function() {
			return x.domain();
		},
		
		update : function(updateData) {
			// TODO: transition by translation + append / remove data, so appears to slide
			var updatedDataArray = sn.powerDataArray(updateData, []);
			
			var updatedLayers = d3.layout.stack()(sources.map(function(source) {
				return updatedDataArray.map(function(d) {
				  return {x: d.date, y: (d[source] !== undefined ? +d[source].watts : 0)};
				});
			}));
			
			layers.forEach(function(el, i) {
				el.shift();
				updatedLayers[i].forEach(function(n) { el.push(n); });
			});
			
			x.domain([layers[0][0].x, layers[0][layers[0].length - 1].x]);
			
			var area = d3.select(containerSelector).selectAll('path.area')
					.data(layers);
			area.transition()
				.duration(1000)
				.attr("d", d3.svg.area()
					.interpolate("monotone")
					.x(function(d) { return x(d.x); })
					.y0(function(d) { return y(d.y0); })
					.y1(function(d) { return y(d.y0 + d.y); }));

			var line = d3.select(containerSelector).selectAll('path.line')
					.data(layers);
			line.transition()
				.duration(1000)
				.attr("d", d3.svg.line()
					.interpolate("monotone")
					.x(function(d) { return x(d.x); })
					.y(function(d) { return y(d.y0 + d.y); }));
					
					
			var label = svg.selectAll("text")
			  .data(x.ticks(12));
			  
			label.enter().insert("text")
			  .attr("x", x)
			  .attr("y", h + 6)
			  .attr("dy", ".71em")
			  .text(x.tickFormat(12))
			  .transition()
			  	.duration(1000)
			  	.attr('x', x);
			  	
			label.transition()
				.duration(1000)
				.attr('x', x);
				
			label.exit().transition()
				.duration(1000)
				.attr('x', function(d, i) { return x(d, i - 1); });

		}
	};
}

// parse URL parameters into sn.env
// support passing nodeId and other values as URL parameter, e.g. ?nodeId=11
(function() {
	if ( window.location.search !== undefined ) {
		var match = window.location.search.match(/\w+=[^&]+/g);
		var i;
		var keyValue;
		if ( match !== null ) {
			for ( i = 0; i < match.length; i++ ) {
				keyValue = match[i].split('=', 2);
				sn.env[keyValue[0]] = keyValue[1];
			}
		}
	}
})();

var urlHelper = sn.urlHelper(sn.env.nodeId);

sn.env.fillColors = sn.colors.triplets;

function setup(json, sourceList) {
	sn.runtime.colorData = sn.colorData(sn.env.fillColors, sourceList);
	
	var endDate = sn.dateTimeFormat.parse(json.data.endDate);
	var weekChart = undefined;
	(function() {
		var e = new Date(endDate.getTime());
		e.setMinutes(0,0,0); // truncate to nearest hour
		//e = new Date(endDate.getTime() + (60 * 60 * 1000)); // add 1 hour to include current hour

		// for testing updates, force time back a bit
		//e = new Date(e.getTime() - (4 * 60 * 60 * 1000));
		
		// daily Wh chart, agg by hour
		var weekRange = [
				new Date(e.getTime() - ((sn.env.numDays * 24 - 1) * 60 * 60 * 1000)),
				new Date(e.getTime())
			];
		d3.json(urlHelper.dateTimeQuery(sn.env.dataType, weekRange[0], weekRange[1], 'Hour'), function(json) {
			weekChart = stackWattHourChart(json.data, '#week-watthour');
			
			var colorData = sn.runtime.colorData.slice().reverse();
			
			// add labels based on sources
			var labelTableRows = d3.select('#source-labels').append('table').append('tbody')
					.selectAll('tr').data(colorData).enter().append('tr');
				
			labelTableRows.selectAll('td.swatch')
					.data(function(d) { return [d.color]; })
				.enter().append('td')
						.attr('class', 'swatch')
						.style('background-color', function(d) { return d; });
					
			labelTableRows.selectAll('td.desc')
					.data(function(d) { return [d.source]; })
				.enter().append('td')
						.attr('class', 'desc')
						.text(function(d) { return d; });
		});
	})();

	// 1 day W chart agg by 10 minute intervals
	
	var daySetup = function(endDate) {
		var e = new Date(endDate.getTime());
		// truncate end date to nearest day precision minutes
		e.setMinutes((endDate.getMinutes() - (endDate.getMinutes() % sn.env.dayPrecision)), 0, 0);
		
		var dayRange = [
			new Date(e.getTime() - (sn.env.numHours * 60 * 60 * 1000)), 
			new Date(e.getTime())
			];
		d3.json(urlHelper.dateTimeQuery(sn.env.dataType, dayRange[0], dayRange[1], sn.env.dayPrecision), function(json) {
			areaWattChart(json.data, '#day-watt');
			
			/* Needs work: incremental update
			dayRange[0] = new Date(dayRange[1].getTime() - (sn.env.dayPrecision * 60 * 1000));
			setInterval(function() {
				dayRange[0] = new Date(dayRange[0].getTime() + (sn.env.dayPrecision * 60 * 1000));
				dayRange[1] = new Date(dayRange[1].getTime() + (sn.env.dayPrecision * 60 * 1000));
				d3.json(urlHelper.dateTimeQuery('power', dayRange[0], dayRange[1], sn.env.dayPrecision), function(json) {
					chart.update(json.data);
				});
			}, 2000);
			*/
		});
	};
	
	
	// for testing updates, force time back a bit
	//daySetup(new Date(endDate.getTime() - (4 * 60 * 60 * 1000)));
	daySetup(endDate);
	setInterval(function() {
		d3.json(urlHelper.reportableInterval([sn.env.dataType]), function(json) {
			if ( json.data === undefined || json.data.endDate === undefined ) {
				sn.log('No data available for node {0}', urlHelper.nodeId());
				return;
			}
			
			var endDate = sn.dateTimeFormat.parse(json.data.endDate);
			daySetup(endDate);
			if ( weekChart !== undefined ) {
				var xDomain = weekChart.xDomain();
				var currEndDate = xDomain[xDomain.length - 1];
				var newEndDate = new Date(endDate.getTime());
				currEndDate.setMinutes(0,0,0); // truncate to nearest hour
				newEndDate.setMinutes(0,0,0);
				if ( newEndDate.getTime() > currEndDate.getTime() ) {
					d3.json(urlHelper.dateTimeQuery(sn.env.dataType, new Date(newEndDate.getTime() - ((sn.env.numDays * 24 - 1) * 60 * 60 * 1000)), newEndDate, 'Hour'), function(json) {
						weekChart = stackWattHourChart(json.data, '#week-watthour');
					});
				}
			}
		});
	}, sn.env.dayPrecision * 60 * 1000);
	
	/*
	function updateReadings() {
		d3.json(urlHelper.mostRecentQuery(sn.env.dataType), function(json) {
			if ( json.data === undefined ) {
				sn.log('No data available for node {0}', urlHelper.nodeId());
				return;
			}
			var totalPower = d3.sum(json.data, function(d) { return d.watts; });
			var unit = 'W';
			if ( totalPower >= 1000 ) {
				unit = 'kW';
				totalPower /= 1000;
			}
			var fmt = d3.format(',g');
			d3.select('#readings div.power')
				.html(fmt(totalPower) + ' <span class="unit">' +unit +'</span>');
				
			var dailyEnergy = d3.sum(json.data, function(d) { return d.wattHourReading; });
			unit = 'Wh';
			if ( dailyEnergy >= 1000 ) {
				unit = 'kWh';
				dailyEnergy /= 1000;
			}
			d3.select('#readings div.energy')
				.html(fmt(dailyEnergy) + ' <span class="unit">' +unit +'</span>');
		});
	}
	
	// every minute update reading values
	updateReadings();
	setInterval(function() {
		updateReadings();
	}, 60 * 1000);
	*/
}

function onDocumentReady() {
	d3.select('#num-days').text(sn.env.numDays);
	d3.select('#num-hours').text(sn.env.numHours);
	
	d3.json(urlHelper.reportableInterval([sn.env.dataType]), function(repInterval) {
		if ( repInterval.data === undefined || repInterval.data.endDate === undefined ) {
			sn.log('No data available for node {0}', urlHelper.nodeId());
			return;
		}
		
		d3.json(urlHelper.availableSources([sn.env.dataType], sn.dateTimeFormat.parse(repInterval.data.startDate), sn.dateTimeFormat.parse(repInterval.data.endDate)), function(sourceList) {
			if ( sourceList === undefined || Array.isArray(sourceList) !== true ) {
				sn.log('No sources available for node {0}', urlHelper.nodeId());
				return;
			}
			sourceList.sort();
			setup(repInterval, sourceList);
		});
	});
}

if ( !window.isLoaded ) {
	window.addEventListener("load", function() {
		onDocumentReady();
	}, false);
} else {
	onDocumentReady();
}
