<%@ taglib uri="http://packtag.sf.net" prefix="pack" %>
<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<html lang="en">
<head>
	<title><spring:theme code="app.title"/></title>
	
	<link rel="stylesheet" type="text/css" href="<c:url value='/css/smoothness/jquery-ui-1.8.13.custom.css'/>" />
	
	<%-- Only looking to support ipad horizontal view at the moment --%>
	<meta name="viewport" content="width=1024,initial-scale=1.0" />
	<meta name="apple-mobile-web-app-capable" content="yes"/>
<c:set var="packFiles">
	/css/jquery.jqplot.css		
	/css/console.css
	<spring:theme code="app.style"/>
</c:set>
	<pack:style>
		${packFiles}
	</pack:style>
<c:set var="packFiles">
	/js-lib/jquery-1.6.4.js
	/js-lib/jquery.form.js
	/js-lib/jquery-ui-1.8.13.custom.min.js		
	/js-lib/jquery.jqplot.js
	/js-lib/jqplot-plugins/jqplot.canvasTextRenderer.js
	/js-lib/jqplot-plugins/jqplot.canvasAxisLabelRenderer.js
	/js-lib/jqplot-plugins/jqplot.categoryAxisRenderer.js
	/js-lib/jqplot-plugins/jqplot.dateAxisRenderer.js
	/js-lib/jqplot-plugins/jqplot.barRenderer.js
	/js-lib/jqplot-plugins/jqplot.ohlcRenderer.js
	/js-lib/jqplot-plugins/jqplot.cursor.js
	/js-lib/jqplot-plugins/jqplot.highlighter.js
	/js-lib/jqplot-plugins/jqplot.pointLabels.js
	/js-lib/hmac-sha1.js		
	/js-lib/enc-base64.js
	/js/console.js
	/js/graph.js
	/js/sn.js
	<spring:theme code="app.javascript"/>
</c:set>
	<pack:script>
		${packFiles}
	</pack:script>
	
	<%-- Doesn't seem to be playing nice with the pack script --%>
	<script type="text/javascript" src="<c:url value='/js-lib/jquery.formatCurrency-1.4.0.js'/>"></script>
</head>
<body>
	<%-- Used by the graph --%>
	<form style="display: none;">
	<fieldset>
	<input type="hidden" id ="nodeId" value="${param['nodeId']}"/>
	<input type="hidden" id="consumptionSourceId" name="consumptionSourceId" value="${consumptionSourceId}" />
	</fieldset>
	</form>
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

<div class="ui-support container">
	<div id="login-container">
		<p class="intro">
			Enter your SolarNetwork security token and password to log in. 
			If you do not have a security token created for your SolarNetwork account, 
			<a href="/solaruser/index.do">go to SolarNetwork</a> and create one.
		</p>
		<form class="form" id="credentials">
			<fieldset>
					<label>
						Token
						<input type="text" value="" placeholder="Security Token" maxlength="64" name="token" required="required"/>
					</label>
					<br/>
					<label>
						Secret
						<input type="password" placeholder="Secret" maxlength="64" name="secret" required="required"/>
					</label>
			</fieldset>
			<div class="form-actions">
				<button class="btn btn-primary" type="submit">Login</button>
			</div>
		</form>
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
	mpcConsole.startRefreshTimer(nodeId);
	//mpcConsole.test(nodeId);// TODO remove test code
	
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
</html>
