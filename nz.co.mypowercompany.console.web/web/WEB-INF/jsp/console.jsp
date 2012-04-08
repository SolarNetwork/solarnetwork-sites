<head>
	<title>SolarNet Dashboard</title>
	
	<link rel="stylesheet" type="text/css" href="<c:url value='/css/smoothness/jquery-ui-1.8.13.custom.css'/>" />
	
	<%-- Only looking to support ipad horizontal view at the moment --%>
	<meta name="viewport" content="width=1024,initial-scale=1.0" />
	<meta name="apple-mobile-web-app-capable" content="yes"/>
	
	<pack:style>
		<src>/css/jquery.jqplot.css</src>
		
		<src>/css/console.css</src>
	</pack:style>
	<pack:script> 
		<src>/js-lib/jquery-1.6.4.js</src>
		<src>/js-lib/jquery.form.js</src>
		<src>/js-lib/jquery-ui-1.8.13.custom.min.js</src>
		
		<src>/js-lib/jquery.jqplot.js</src>
		<src>/js-lib/jqplot-plugins/jqplot.canvasTextRenderer.js</src>
		<src>/js-lib/jqplot-plugins/jqplot.canvasAxisLabelRenderer.js</src>
		<src>/js-lib/jqplot-plugins/jqplot.categoryAxisRenderer.js</src>
		<src>/js-lib/jqplot-plugins/jqplot.dateAxisRenderer.js</src>
		<src>/js-lib/jqplot-plugins/jqplot.barRenderer.js</src>
		<src>/js-lib/jqplot-plugins/jqplot.ohlcRenderer.js</src>
		<src>/js-lib/jqplot-plugins/jqplot.cursor.js</src>
		<src>/js-lib/jqplot-plugins/jqplot.highlighter.js</src>
		<src>/js-lib/jqplot-plugins/jqplot.pointLabels.js</src>
		
		<src>/js/console.js</src>
		<src>/js/graph.js</src>
	</pack:script>
	
	<%-- Doesn't seem to be playing nice with the pack script --%>
	<script type="text/javascript" src="<c:url value='/js-lib/jquery.formatCurrency-1.4.0.js'/>"></script>
</head>
<body>
	<%-- Used by the graph --%>
	<input type="hidden" id ="nodeId" value="${param['nodeId']}"/>
	<input type="hidden" id="consumptionSourceId" name="consumptionSourceId" value="${consumptionSourceId}" />
	
	<div class="content">
	
		<jsp:include page="/WEB-INF/jsp/console/header.jsp"></jsp:include>
	
		<%-- The tabs, ids should match the hashes for hrefs in the menu found in header.jsp --%>
		<div class="tab_content overview"><jsp:include page="/WEB-INF/jsp/console/overview.jsp"></jsp:include></div>
		<div class="tab_content manual" style="display:none"></div>
		<div class="tab_content switches" style="display:none"><jsp:include page="/WEB-INF/jsp/console/switches.jsp"></jsp:include></div>
		<div class="tab_content history" style="display:none"></div>
		<div class="tab_content settings" style="display:none"><jsp:include page="/WEB-INF/jsp/console/settings.jsp"></jsp:include></div>
		
		<%-- Overlay for displaying friends data --%>
		<div id="friends_overlay" style="display:none;">
			<img src="images/friends/Friends-Example.png"/>
			<div class="friends_overlay_avatar"></div>
		</div>
		
	</div>

<script type="text/javascript">

$(document).ready(function() {
	// Hook up the menu change tab functionality
	$('.menu_item a').click(function() {
		changeTab(this);
	});

	// Setup the MPC Console
	var mpcConsole = new MPCConsole();
	var nodeId = ${param['nodeId']};
	mpcConsole.populateConsole(nodeId);
	//mpcConsole.test(nodeId);// TODO remove test code
	setInterval(
		function(){
			mpcConsole.populateConsole(nodeId);
		}, 
		60000);
	
	// Select the current tab
	if (document.location.hash) {
		mpcConsole.debug('Loading tab ' + document.location.hash.substr(1));
		changeTab($('.menu_item a[href=' + document.location.hash + ']')[0]);
	}
	
	$('#friends_button').click(function(){toggleFriendsBar();});
	$('#friends_bar_close').click(function(){toggleFriendsBar();});
	
	$('.friends_avatar').click(function(){changeFriend($(this));});
});
</script>	

</body>