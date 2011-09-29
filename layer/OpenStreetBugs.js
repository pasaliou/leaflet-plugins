L.OpenStreetBugs = L.FeatureGroup.extend({
	options : {
		serverURL : "http://openstreetbugs.schokokeks.org/api/0.1/",
		readonly : false,
		setCookie : true,
		username : "NoName",
		cookieLifetime : 1000,
		cookiePath : null,
		permalinkURL : "http://www.openstreetmap.org/",
		opacity : 0.7,
		iconOpen: "http://openstreetbugs.schokokeks.org/client/open_bug_marker.png",
		iconClosed:"http://openstreetbugs.schokokeks.org/client/closed_bug_marker.png",
		editArea: 0.01,
	},

	initialize : function(options)
	{
		L.Util.setOptions(this, options);
		putAJAXMarker.layers.push(this);

		this.bugs = {};
		this._layers = {};

		var username = this.get_cookie("osbUsername");
		if (username)
			this.options.username = username;

		L.OpenStreetBugs.setCSS();
	},

	onAdd : function(map)
	{
		this._map = map;
		this._map.on("moveend", this.loadBugs, this);
		this._iterateLayers(map.addLayer, map);
		this.loadBugs();
		if (!this.options.readonly) {
			map.doubleClickZoom.disable();
			map.on('dblclick', this.addBug, this);
		}
	},

	onRemove : function(map)
	{
		this._map.off("moveend", this.loadBugs, this);
		this._iterateLayers(map.removeLayer, map);
		delete this._map;
		if (!this.options.readonly) {
			map.doubleClickZoom.enable();
			map.off('dblclick', this.addBug, this);
		}
	},

	set_cookie : function(name, value)
	{
		var expires = (new Date((new Date()).getTime() + 604800000)).toGMTString(); // one week from now
		document.cookie = name+"="+escape(value)+";expires="+expires+";";
	},

	get_cookie : function(name)
	{
		var cookies = (document.cookie || '').split(/;\s*/);
		for(var i=0; i<cookies.length; i++)
		{
			var cookie = cookies[i].split("=");
			if(cookie[0] == name)
				return unescape(cookie[1]);
		}
		return null;
	},

	loadBugs : function()
	{
		//if(!this.getVisibility())
		//	return true;

		var bounds = this._map.getBounds();
		if(!bounds) return false;
		var sw = bounds.getSouthWest(), ne = bounds.getNorthEast();

		function round(number, digits) {
			var factor = Math.pow(10, digits);
			return Math.round(number*factor)/factor;
		}

		this.apiRequest("getBugs"
			+ "?t="+round(ne.lat, 5)
			+ "&r="+round(ne.lng, 5)
			+ "&b="+round(sw.lat, 5)
			+ "&l="+round(sw.lng, 5));
	},

	apiRequest : function(url, reload)
	{
		var script = document.createElement("script");
		script.type = "text/javascript";
		script.src = this.options.serverURL + url + "&nocache="+(new Date()).getTime();
		var _this = this;
		script.onload = function(e) {
			document.body.removeChild(this);
			if (reload) _this.loadBugs();
		};
		document.body.appendChild(script);
	},

	createMarker: function(id, force)
	{
		var bug = putAJAXMarker.bugs[id];
		if(this.bugs[id])
		{
			if (force || this.bugs[id].osb.closed != bug[2])
				this.removeLayer(this.bugs[id]);
			else
				return;
		}

		var icon_url = bug[2] ? this.options.iconClosed : this.options.iconOpen;
		var feature = new L.Marker(bug[0], {icon:new this.osbIcon(icon_url)});
		feature.osb = {id: id, closed: bug[2]};
		this.addLayer(feature);
		this.bugs[id] = feature;
		this.setPopupContent(id);

		//this.events.triggerEvent("markerAdded");
	},

	osbIcon :  L.Icon.extend({
			iconUrl: 'http://openstreetbugs.schokokeks.org/client/open_bug_marker.png',
			iconSize: new L.Point(22, 22),
			shadowSize: new L.Point(0, 0),
			iconAnchor: new L.Point(11, 11),
			popupAnchor: new L.Point(0, -11)
	}),

	setPopupContent: function(id) {
		if(this.bugs[id]._popup_content)
			return;

		var el1,el2,el3;
		var layer = this;

		var rawbug = putAJAXMarker.bugs[id];
		var isclosed = rawbug[2];

		var newContent = L.DomUtil.create('div', 'osb-popup');

		newContent.innerHTML = '<h3 style="text-align: center; margin-bottom: 0pt;">'+(isclosed ? L.i18n("Fixed Error") : L.i18n("Unresolved Error"))+'</h3>';

		var dl = L.DomUtil.create('dl', null, newContent);
		dl.style.margin_top="0px";
		for(var i=0; i<rawbug[1].length; i++)
		{
			var cls = i == 0 ? "osb-description" : "osb-comment";
			var dt = L.DomUtil.create('dt', cls, dl);
			dt.textContent = i == 0 ? L.i18n("Description") : L.i18n("Comment");
			var dd = L.DomUtil.create('dd', cls, dl);
			dd.textContent = rawbug[1][i];
		}

		var form = L.DomUtil.create("form", null, newContent);
		var _this = this;
		if (!isclosed && !this.options.readonly) {
			var content = '';
			content += '<br /><table width="100%">';
			content += '<input name="osbid" type="hidden"/>';
			content += '<tr><td>'+L.i18n("Nickname:")+'</td><td><input name="osbnickname" type="text" size="44"></td></tr>';
			content += '<tr><td>'+L.i18n("Comment:")+'</td><td><input name="osbcomment" type="text" size="44"></td></tr>';
			content += '<tr><td colspan="2" align="center"><br /><input name="add_comment" type="submit">&nbsp;';
			content += '<input name="mark_fixed" type="button">&nbsp;';
			content += '<input name="edit" type="button"/></td></tr></table>';
			form.innerHTML = content;
			form.osbid.value = id;
			form.osbnickname.value = this.options.username;
			form.add_comment.value = L.i18n("Add comment");
			form.mark_fixed.value = L.i18n("Mark as fixed");
			form.mark_fixed.onclick = function(e) {
				bug.closePopup();
				_this.closeBug(this);
			};
		} else {
			form.innerHTML += '<div><input name="edit" type="button"/></div>';
		}
		form.edit.onclick = function() { _this.remoteEdit(rawbug[0]); }
		form.edit.value = L.i18n("in JOSM");
		form.onsubmit = function(e) {
			bug.closePopup();
			_this.submitComment(form);
			return false;
		};

		var bug = this.bugs[id];

		bug._popup_content = newContent;
		bug.bindPopup(newContent);
		bug._popup.options.maxWidth=400;
		bug.on('mouseover', bug.openTempPopup, bug);
	},

	submitComment: function(form) {
		var nickname = form.osbnickname.value;
		if (nickname=="") {nickname = this.options.username;}
		this.apiRequest("editPOIexec"
			+ "?id="+encodeURIComponent(form.osbid.value)
			+ "&text="+encodeURIComponent(form.osbcomment.value + " [" + nickname + "]")
			+ "&format=js", true
		);
		this.set_cookie("osbUsername",nickname);
		this.options.username=nickname;
	},

	closeBug: function(data) {
		this.submitComment(data.form)
		this.apiRequest("closePOIexec"
			+ "?id="+encodeURIComponent(data.form.osbid.value)
			+ "&format=js", true
		);
	},

	addBug: function(e) {
		var newContent = L.DomUtil.create('div', 'osb-popup');

		newContent.innerHTML += '<h3 style="text-align: center; margin-bottom: 0pt;">'+L.i18n("New bug")+'</h3>';

		var popup = new L.Popup();
		var _this = this;
		var form = L.DomUtil.create('form', null, newContent);
		var content = '';
		content += '<table width="100%">';
		content += '<input name="osblat" type="hidden"/>';
		content += '<input name="osblon" type="hidden"/>';
		content += '<tr><td>'+L.i18n("Nickname:")+'</td><td><input name="osbnickname" type="text" size="44" value=""></td></tr>';
		content += '<tr><td>'+L.i18n("Comment:")+'</td><td><input name="osbcomment" type="text" size="44"></td></tr>';
		content += '<tr><td colspan="2" align="center"><input name="submit" type="submit"/></td></tr></table>';
		form.innerHTML = content;
		form.osbnickname.value = this.options.username;
		form.osblat.value = e.latlng.lat;
		form.osblon.value = e.latlng.lng;
		form.submit.value = L.i18n("Add comment");
		form.onsubmit = function(e) {
			_this._map.closePopup(popup);
			_this.createBug(form);
			return false;
		};

		popup.setLatLng(e.latlng);
		popup.setContent(newContent);
		popup.options.maxWidth=400;

		this._map.openPopup(popup);
	},

	createBug: function(form) {
		var nickname = form.osbnickname.value;
		if (nickname=="") {nickname = this.options.username;}
		this.apiRequest("addPOIexec"
			+ "?lat="+encodeURIComponent(form.osblat.value)
			+ "&lon="+encodeURIComponent(form.osblon.value)
			+ "&text="+encodeURIComponent(form.osbcomment.value + " [" + nickname + "]")
			+ "&format=js", true
		);
		this.set_cookie("osbUsername",nickname);
		this.options.username=nickname;
	},

	remoteEdit: function(x) {
		var ydelta = this.options.editArea || 0.01;
		var xdelta = ydelta * 2;
		var p = [ 'left='  + (x.lng - xdelta), 'bottom=' + (x.lat - ydelta)
			, 'right=' + (x.lng + xdelta), 'top='    + (x.lat + ydelta)];
		var url = 'http://localhost:8111/load_and_zoom?' + p.join('&');
		var frame = L.DomUtil.create('iframe', null, document.body);
		frame.style.width = frame.style.height = "0px";
		frame.src = url;
		frame.onload = function(e) { document.body.removeChild(frame); };
		return false;
	}
})

L.OpenStreetBugs.setCSS = function() {
	if(L.OpenStreetBugs.setCSS.done)
		return;
	else
		L.OpenStreetBugs.setCSS.done = true;

	// See http://www.hunlock.com/blogs/Totally_Pwn_CSS_with_Javascript
	var idx = 0;
	var addRule = function(selector, rules) {
		var s = document.styleSheets[0];
		var rule;
		if(s.addRule) // M$IE
			rule = s.addRule(selector, rules, idx);
		else
			rule = s.insertRule(selector + " { " + rules + " }", idx);
		s.style = L.Util.extend(s.style || {}, rules);
		idx++;
	};

	addRule(".olPopupFramedCloudOpenStreetBugs dl", 'margin:0; padding:0;');
	addRule(".olPopupFramedCloudOpenStreetBugs dt", 'margin:0; padding:0; font-weight:bold; float:left; clear:left;');
	addRule(".olPopupFramedCloudOpenStreetBugs dt:after", 'content: ": ";');
	addRule("* html .olPopupFramedCloudOpenStreetBugs dt", 'margin-right:1ex;');
	addRule(".olPopupFramedCloudOpenStreetBugs dd", 'margin:0; padding:0;');
	addRule(".olPopupFramedCloudOpenStreetBugs ul.buttons", 'list-style-type:none; padding:0; margin:0;');
	addRule(".olPopupFramedCloudOpenStreetBugs ul.buttons li", 'display:inline; margin:0; padding:0;');
	addRule(".olPopupFramedCloudOpenStreetBugs h3", 'font-size:1.2em; margin:.2em 0 .7em 0;');
};

function putAJAXMarker(id, lon, lat, text, closed)
{
	var comments = text.split(/<hr \/>/);
	for(var i=0; i<comments.length; i++)
		comments[i] = comments[i].replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
	var old = putAJAXMarker.bugs[id]
	putAJAXMarker.bugs[id] = [
		new L.LatLng(lat, lon),
		comments,
		closed,
		text
	];
	var force = (old && old[3]) != text;
	for(var i=0; i<putAJAXMarker.layers.length; i++)
		putAJAXMarker.layers[i].createMarker(id, force);
}

L.i18n = function(s) { return s; }

function osbResponse(error)
{
	if(error)
		alert("Error: "+error);

	return;
	for(var i=0; i<putAJAXMarker.layers.length; i++)
		putAJAXMarker.layers[i].loadBugs();
}

putAJAXMarker.layers = [ ];
putAJAXMarker.bugs = { };

L.Marker.include({
	openTempPopup: function() {
		this.openPopup();
		function onout() {
			this.off('mouseout', onout, this);
			this.closePopup();
		};
		this.on("mouseout", onout, this);
		this.on("click", function() { this.off('mouseout', onout, this); }, this);
	},
});
