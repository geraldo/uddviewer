import 'ol-layerswitcher/dist/ol-layerswitcher.css';
import 'ol-ext/dist/ol-ext.css';
import 'font-awesome/css/font-awesome.min.css';
import './style.css';

import {Map, View, Collection} from 'ol';
import {Tile as TileLayer, Vector as VectorLayer, Group as LayerGroup} from 'ol/layer';
import {Vector as VectorSource, BingMaps, XYZ, OSM, TileWMS} from 'ol/source';
import {Style, Fill, Stroke, Circle} from 'ol/style';
import {GPX, GML, GeoJSON, IGC, KML, TopoJSON} from 'ol/format';
import {defaults} from 'ol/control';
import {get as getProjection, transform, fromLonLat, toLonLat} from 'ol/proj';
import {register} from 'ol/proj/proj4';
import {unByKey} from 'ol/Observable';

import proj4 from 'proj4';
import LayerSwitcher from 'ol-layerswitcher';
import Popup from 'ol-popup';
import Button from 'ol-ext/control/Button';
import Overlay from 'ol-ext/control/Overlay';
import LayerSwitcherImage from 'ol-ext/control/LayerSwitcherImage';
import GeolocationButton from 'ol-ext/control/GeolocationButton';
import SearchNominatim from 'ol-ext/control/SearchNominatim';
import DropFile from 'ol-ext/interaction/DropFile';
import loadGpkg from 'ol-load-geopackage';
import $ from 'jquery';

const jsonURL = 'geodata/UDDviewer.qgs.json',
      /*qgisServerURL = 'https://mapa.psig.es/qgisserver/cgi-bin/qgis_mapserv.fcgi',
      mapproxyServerURL = 'https://mapa.psig.es/mapproxy/service?',
      qgisProjectFile = '/home/ubuntu/UDDviewer/UDDviewer.qgs';*/
      qgisServerURL = 'http://82.223.108.240/qgisserver/cgi-bin/qgis_mapserv.fcgi',
      mapproxyServerURL = 'http://82.223.108.240/mapproxy/service?',
      qgisProjectFile = '/home/qgis/UDDviewer/UDDviewer.qgs';
let wmsLayers = [],
    qgisSources = {};

/*
 * LayerSwitcher extended with legends
 *****************************************/
class LayerSwitcherWithLegend extends LayerSwitcher {
  /**
   * Re-draw the layer panel to represent the current state of the layers.
   */
  renderPanel() {
    this.dispatchEvent('render');
    LayerSwitcherWithLegend.renderPanel(this.getMap(), this.panel, {
      groupSelectStyle: this.groupSelectStyle,
      reverse: this.reverse
    });
    this.dispatchEvent('rendercomplete');
  }

  static renderPanel(map, panel, options) {
    // Create the event.
    const render_event = new Event('render');
    // Dispatch the event.
    panel.dispatchEvent(render_event);
    options = options || {};
    options.groupSelectStyle = LayerSwitcher.getGroupSelectStyle(options.groupSelectStyle);
    LayerSwitcher.ensureTopVisibleBaseLayerShown(map, options.groupSelectStyle);
    while (panel.firstChild) {
        panel.removeChild(panel.firstChild);
    }
    // Reset indeterminate state for all layers and groups before
    // applying based on groupSelectStyle
    LayerSwitcher.forEachRecursive(map, function (l, _idx, _a) {
        l.set('indeterminate', false);
    });
    if (options.groupSelectStyle === 'children' ||
        options.groupSelectStyle === 'none') {
        // Set visibile and indeterminate state of groups based on
        // their children's visibility
        LayerSwitcher.setGroupVisibility(map);
    }
    else if (options.groupSelectStyle === 'group') {
        // Set child indetermiate state based on their parent's visibility
        LayerSwitcher.setChildVisibility(map);
    }
    const ul = document.createElement('ul');
    panel.appendChild(ul);
    // passing two map arguments instead of lyr as we're passing the map as the root of the layers tree
    LayerSwitcherWithLegend.renderLayers_(map, map, ul, options, function render(_changedLyr) {
        LayerSwitcherWithLegend.renderPanel(map, panel, options);
    });
    // Create the event.
    const rendercomplete_event = new Event('rendercomplete');
    // Dispatch the event.
    panel.dispatchEvent(rendercomplete_event);
  }

  static renderLayers_(map, lyr, elm, options, render) {
    let lyrs = lyr.getLayers().getArray().slice();
    if (options.reverse)
      lyrs = lyrs.reverse();
    for (let i = 0, l; i < lyrs.length; i++) {
      l = lyrs[i];
      if (l.get('title')) {
          elm.appendChild(LayerSwitcherWithLegend.renderLayer_(map, l, i, options, render));
      }
    }

    // add event for legend dropdown
    $('li.layer i').unbind("click").click(function(){
      $(this).toggleClass('fa-caret-up');
      $(this).toggleClass('fa-caret-down');
      if ($(this).hasClass('fa-caret-down')) {
        $(this).parent().parent().find('img').css("display", "none");
      } else {
        $(this).parent().parent().find('img').css("display", "block");
      }
      return false;
    });
  }

  static renderLayer_(map, lyr, idx, options, render) {
    const li = document.createElement('li'),
          lyrTitle = lyr.get('title'),
          checkboxId = LayerSwitcher.uuid(),
          label = document.createElement('label');

    if (lyr instanceof LayerGroup && !lyr.get('combine')) {
      li.classList.add('group');
      const isBaseGroup = LayerSwitcher.isBaseGroup(lyr);
      if (isBaseGroup) {
        li.classList.add('base-group');
      }
      // Group folding
      if (lyr.get('fold')) {
        li.classList.add('layer-switcher-fold');
        li.classList.add('layer-switcher-' + lyr.get('fold'));
        const btn = document.createElement('button');
        btn.onclick = function (e) {
          const evt = e || window.event;
          LayerSwitcher.toggleFold_(lyr, li);
          evt.preventDefault();
        };
        li.appendChild(btn);
      }
      if (!isBaseGroup && options.groupSelectStyle != 'none') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = checkboxId;
        input.checked = lyr.getVisible();
        input.indeterminate = lyr.get('indeterminate');
        input.onchange = function (e) {
          const target = e.target;
          LayerSwitcher.setVisible_(map, lyr, target.checked, options.groupSelectStyle);
          render(lyr);
        };
        li.appendChild(input);
        label.htmlFor = checkboxId;
      }
      //label.innerHTML = '<i class="fa fa-eye"></i> ' + lyrTitle;
      label.innerHTML = lyrTitle;
      li.appendChild(label);
      const ul = document.createElement('ul');
      li.appendChild(ul);
      LayerSwitcherWithLegend.renderLayers_(map, lyr, ul, options, render);
    }
    else {
      li.className = 'layer ' + makeSafeForCSS(lyr.get('title'));
      const input = document.createElement('input');
      if (lyr.get('type') === 'base') {
        input.type = 'radio';
      }
      else {
        input.type = 'checkbox';
      }
      input.id = checkboxId;
      input.checked = lyr.get('visible');
      input.indeterminate = lyr.get('indeterminate');
      input.onchange = function (e) {
        const target = e.target;
        LayerSwitcher.setVisible_(map, lyr, target.checked, options.groupSelectStyle);
        render(lyr);
      };
      li.appendChild(input);

      label.htmlFor = checkboxId;

      if (lyr.get('showlegend')) {
        label.innerHTML = lyrTitle + '<i class="fa fa-caret-down" aria-hidden="true"></i>';
      } else {
        label.innerHTML = lyrTitle;
      }

      const rsl = map.getView().getResolution();
      if (rsl >= lyr.getMaxResolution() || rsl < lyr.getMinResolution()) {
        label.className += ' disabled';
      }
      else if (lyr.getMinZoom && lyr.getMaxZoom) {
        const zoom = map.getView().getZoom();
        if (zoom <= lyr.getMinZoom() || zoom > lyr.getMaxZoom()) {
          label.className += ' disabled';
        }
      }
      li.appendChild(label);

      // append legend
      if (lyr.get('children') !== undefined) {
        lyr.get('children').forEach(function(sublayer, i) {
          if (sublayer.showlegend == true) {
            // show legend
            var img = document.createElement('img');
            img.className = 'legend';
            
            //if (!sublayer.mapproxy) {
              // dynamic from qgis server
              img.src = qgisServerURL + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&TRANSPARENT=true&ITEMFONTCOLOR=white&LAYER='+sublayer.name+'&FORMAT=image/png&SLD_VERSION=1.1.0&SYMBOLWIDTH=4&ITEMFONTSIZE=10&BOXSPACE=1&MAP=' + qgisProjectFile;

              // remove image title for all but this layer
              if (lyr.get('title') !== 'Planejament urbanístic')
                img.src += "&LAYERTITLE=false";
            /*}
            else {
              // static from directory
              img.src = "legend/"+sublayer.mapproxy+'.png';
            }*/
            
            li.appendChild(img);
          }
        });
      }

      else if (lyr.get('showlegend') || lyr.get('title') === 'Cadastre') {
        // show legend
        var img = document.createElement('img');
        img.className = 'legend';
        if (lyr.get('title') === 'Cadastre') {
          img.src = 'https://ovc.catastro.meh.es/Cartografia/WMS/simbolos.png?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYER=Catastro&FORMAT=image/png&SLD_VERSION=1.1.0';
        } 
        else /*if (!lyr.get('mapproxy') && lyr.get('mapproxy') !== undefined)*/ {
          // dynamic from qgis server
          img.src = qgisServerURL + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&TRANSPARENT=true&ITEMFONTCOLOR=white&LAYER='+lyrTitle+'&FORMAT=image/png&SLD_VERSION=1.1.0&LAYERTITLE=false&SYMBOLWIDTH=4&ITEMFONTSIZE=10&BOXSPACE=1&MAP=' + qgisProjectFile;
        }
        /*else {
          // static from directory
          img.src = "legend/"+lyr.get('mapproxy')+'.png';
        }*/
        li.appendChild(document.createElement('br'));
        li.appendChild(img);
      }
    }
    return li;
  }
}

/*
  Map
  ****************************************/
proj4.defs("EPSG:25831","+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
register(proj4);
const proj25831 = getProjection('EPSG:25831');

const qgisLayers = new LayerGroup({
  title: 'Urban Data Desk',
  fold: 'open',
  type: 'group'
});

const bingSource = new BingMaps({
  key: 'Ata7t8y4_jStXw5LscmH7HbH7oAkbKTGhmr5gvzHHBTETAGgUIJb4r_R3yHiZ3gJ',
  imagerySet: 'Aerial',
});

const map = new Map({
  target: 'map',
  layers: [
    new TileLayer({
      title: 'dark',
      baseLayer: true,
      type: 'base',
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
      })
    }),
    new TileLayer({
      title: 'light',
      baseLayer: true,
      type: 'base',
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
      }),
      visible: false
    }),
    new TileLayer({
      title: 'satellite',
      baseLayer: true,
      type: 'base',
      preload: Infinity,
      source: bingSource,
      visible: false
    }),
    new TileLayer({
      title: 'blank',
      baseLayer: true,
      type: 'base',
      source: null,
      visible: false
    }),
    qgisLayers
  ],
  controls: defaults({
    rotateOptions: { autoHide: false}
  }),
  view: new View({
    //projection: proj25831,
    center: fromLonLat([2.15, 41.4]),
    //center: transform([2.15, 41.4], 'EPSG:4326', proj25831),
    rotation: Math.PI/4,
    zoom: 13
  })
});

// base layer switcher
if (bingSource.getState() === 'ready') {
  map.addControl(new LayerSwitcherImage({
    collapsed: false,
    displayInLayerSwitcher: function(layer) {
      return (layer.get("baseLayer")); 
    }
  }));
}
else {
  var key = bingSource.on('change', function() {
    if (bingSource.getState() === 'ready') {
      unByKey(key);
      map.addControl(new LayerSwitcherImage({
        collapsed: false,
        displayInLayerSwitcher: function(layer) {
          return (layer.get("baseLayer")); 
        }
      }));
    }
  })
}

// geolocation
map.addControl(new GeolocationButton({
  title: 'Where am I?',
  delay: 2000
}));

// tooltip
let tooltip = new Popup({
  className: "featureTooltip"
});
map.addOverlay(tooltip);

map.on('pointermove', function (evt) {
  if (evt.dragging) {
    return;
  }
  wmsLayers.forEach(function(layerObj) {
    if (layerObj.getVisible() && layerObj.get("indentifiable") && layerObj.get("type") === "layer") {
      //console.log(layerObj.get("title"), layerObj.getVisible(), layerObj.get("type"));
      const data = layerObj.getData(evt.pixel);
      const hit = data && data[3] > 0; // transparent pixels have zero for data[3]
      map.getTargetElement().style.cursor = hit ? 'pointer' : '';

      if (hit) {
        let url = qgisSources[layerObj.get('title')].getFeatureInfoUrl(
          evt.coordinate, 
          map.getView().getResolution(), 
          map.getView().getProjection(),
          { 'INFO_FORMAT': 'text/xml' }
        );

        if (url) {
          url += "&MAP=" + qgisProjectFile;
          //console.log(layerObj.get('title'), url);

          fetch(url, {
            mode: 'same-origin', // no-cors, *cors, same-origin
          })
          .then((response) => response.text())
          .then((xml) => {

            let xmlDoc = $.parseXML(xml), 
                $xml = $(xmlDoc);

            let i = 0;
            // for each Layer
            $($xml.find('Layer')).each(function() {
              let layer = $(this),
                  layerName = layer.attr('name');

              // for each Feature
              $(layer.find('Feature')).each(function(){

                if ($(this).children().length > 0) {

                  // for each Attribute
                  $(this).find("Attribute").each(function(j, elem){
                    let name = $(elem).attr("name"),
                        value = $(elem).attr("value");

                    if (name === "name" || name === "nom") {
                      tooltip.show(evt.coordinate, '<div>' + layerObj.get("title") + ": <b>" + value + '</b></div>');
                    }
                  });
                }
              });
            });
          });
        }
      }
      else
        tooltip.hide();
    }
  });
});

// popup
let windowFeature = new Overlay({
  closeBox : true,
  className: "slide-right window infoWindow",
  content: document.getElementById("windowFeature")
})
map.addControl(windowFeature);

map.on('click', function(evt) {
  //console.log(evt.coordinate, toLonLat(evt.coordinate));
  selectFeatureInfo(evt.coordinate);
});

$(document).keyup(function(e) {
  if (e.keyCode === 27) { // escape
    windowFeature.hide();
  }
});

/*
 * DropFile Interaction
 *****************************************/
let dropFileSource = new VectorSource({ wrapX: false });
let dropFileLayer = new VectorLayer({
  source: dropFileSource,
});
map.addLayer(dropFileLayer);

let dropInteraction = new DropFile({
  formatConstructors: [
    GPX,
    GeoJSON,
    KML,
    TopoJSON,
    GML
  ],
  accept: [
    "gpx",
    "json",
    "geojson",
    "kml",
    "topojson",
    "gml"
  ]
});
map.addInteraction(dropInteraction);
let loading = 0;

// Drag and drop
dropInteraction.on('loadstart', function (e) {
  if (!loading) dropFileSource.clear();
  
  loading++; 
  $(".loading").show();
  $(".loading p").html("LOADING ("+loading+")");

  //console.log('file loadstart', e.filetype.indexOf("application") !== -1, e.filetype.indexOf("zip") !== -1, e);

  // shape file
  // https://gis.stackexchange.com/a/368103/60146
  if (e.filetype.indexOf("application") !== -1 && e.filetype.indexOf("zip") !== -1) {
    console.log("file dropped -> loading SHP file");

    const files = event.dataTransfer.files;
    for (let i = 0, ii = files.length; i < ii; ++i) {
      const file = files.item(i);
      loadshp({url: file, encoding: 'utf-8'}, function(geojson) {
        const features = new GeoJSON().readFeatures(
          geojson,
          { featureProjection: map.getView().getProjection() }
        );
        const vectorSource = new VectorSource({
          features: features
        });
        map.addLayer(
          new VectorLayer({
            source: vectorSource
          })
        );
        //map.getView().fit(vectorSource.getExtent(), { padding: [100,100,100,100] });
      });
    }
    loading--;
    $(".loading").hide();
  }

  // gpkg
  else if (e.file.type.indexOf("application") !== -1 && e.file.type.indexOf("geopackage") !== -1) {
    console.log("file dropped -> loading Geopackage file", e);
    
    //let gpkgPromise = loadGpkg(event.dataTransfer.files.item(0), 'EPSG:3857');
    let gpkgPromise = loadGpkg(e.file, 'EPSG:3857');
    //let gpkgPromise = loadGpkg("Natural_Earth_QGIS_layers_and_styles.gpkg", e.projection.code_);
    gpkgPromise
    .then(([dataFromGpkg, sldsFromGpkg]) => {
      displayGpkgContents(dataFromGpkg, sldsFromGpkg);

      // Add all vector layers found to map (with default styling)
      for (var table in dataFromGpkg) {
        map.addLayer(new VectorLayer({
          source: dataFromGpkg[table],
        }));
      }
    })
    .catch(error => alert('ol-load-geopackage error: ' + error));
  }
});

// Display (in browser console) details of all tables in GeoPackage
function displayGpkgContents(dataFromGpkg, sldsFromGpkg) {
  // Display SLD strings (if "layer_styles" was found in gpkg)
  if (Object.keys(sldsFromGpkg).length) {
    console.log('Raw SLD XML strings for each layer ("layer_styles" table):');
    console.log(sldsFromGpkg);
    //for (let layer in sldsFromGpkg) {
    //    console.log('"' + layer + '": ' + sldsFromGpkg[layer]);
    //}
  }
}

dropInteraction.on('loadend', function (e) {
  //console.log('file loadend', e);

  // gpkg
  /*if (e.file.type.indexOf("application") !== -1 && e.file.type.indexOf("geopackage") !== -1) {
    //console.log("file dropped -> loading Geopackage file", e);

    //let gpkgPromise = loadGpkg(event.dataTransfer.files.item(0), 'EPSG:3857');
    let gpkgPromise = loadGpkg(e.file, 'EPSG:3857');
    //let gpkgPromise = loadGpkg("Natural_Earth_QGIS_layers_and_styles.gpkg", e.projection.code_);
    gpkgPromise
    .then(([dataFromGpkg, sldsFromGpkg]) => {
      displayGpkgContents(dataFromGpkg, sldsFromGpkg);

      // Add all vector layers found to map (with default styling)
      for (var table in dataFromGpkg) {
        map.addLayer(new VectorLayer({
          source: dataFromGpkg[table],
        }));
      }
    })
    .catch(error => alert('ol-load-geopackage error: ' + error));
  }*/
});

dropInteraction.on('addfeatures', function(event) {
  // geojson, KML, etc.
  console.log("file dropped -> loading Vector features from GeoJSON, KML, etc. file");

  let features = event.features;
  loading--; 

  $(".loading p").html("LOADING ("+loading+")");
  $(".loading span").html(features.length);

  setTimeout(function(){
    dropFileSource.addFeatures(features);
    
    if (!loading) $(".loading").hide();

    let vext = map.getView().getProjection().getExtent();
    let extent = dropFileSource.getExtent();
    if (extent[0]<vext[0]) extent[0] = vext[0];
    if (extent[1]<vext[1]) extent[1] = vext[1];
    if (extent[2]>vext[2]) extent[2] = vext[2];
    if (extent[3]>vext[3]) extent[3] = vext[3];
    map.getView().fit(extent, map.getSize(), { padding: [100,100,100,100] });
  },500);
});

/*
  Load UDD data
  ****************************************/
$.getJSON(jsonURL, function() {})
.done(function(data) {
  qgisLayers.setLayers(new Collection(loadQgisLayers(data)));

  // layer menu
  const layerSwitcher = new LayerSwitcherWithLegend({
    reverse: true,
    groupSelectStyle: 'group',
    activationMode: 'click',
    startActive: true
  });
  map.addControl(layerSwitcher);
})
.fail(function() {
  console.log( "error loading JSON file" );
});

function loadQgisLayers(layersData) {
  let layers = [];

  layersData.slice().reverse().forEach(function(layer, i) {
    if (layer.type === "group" && layer.children) {
      let sublayers = [];

      for (let j=layer.children.length-1; j>=0; j--) {
        let sublayer = layer.children[j];

        if (sublayer.type === "group") {
          sublayers.push(new LayerGroup({
            title: sublayer.name,
            fold: "close",
            layers: loadQgisLayers(sublayer.children),
            type: 'group'
          }));
        }
        else if (sublayer.type === "layer") {
          sublayers.push(loadQgisLayer(sublayer));
        }
      }

      let fold = "open";
      if (layers.length === 0) fold = "close";
      layers.push(new LayerGroup({
        title: layer.name,
        fold: fold,
        layers: sublayers,
        type: 'group'
      }));
    }
    else if (layer.type === "layer") {
      layers.push(loadQgisLayer(layer));
    }
  });

  return layers;
}

function loadQgisLayer(layer) {

  if (layer.type !== "baselayer") {
    // ignore base layers

    let name = null, 
        url = null;

    if (layer.mapproxy) {
      // mapproxy
      name = layer.mapproxy;
      url = mapproxyServerURL;
    }
    else {
      // qgis
      name = layer.name;
      url = qgisServerURL;
    }

    let layerSource = new TileWMS({
      url: url,
      projection: 'EPSG:3857',
      params: {
        'LAYERS': name,
        'TRANSPARENT': true,
        'VERSION': '1.3.0',
        'MAP': qgisProjectFile
      },
      serverType: 'qgis',
      crossOrigin: 'Anonymous'
    });

    // save qgisSource to query layer
    qgisSources[layer.qgisname] = new TileWMS({
      url: qgisServerURL,
      projection: 'EPSG:3857',
      params: {
        'LAYERS': layer.name,
        'TRANSPARENT': true,
        'VERSION': '1.3.0',
      },
      serverType: 'qgis',
      crossOrigin: 'Anonymous'
    });

    let newLayer = 
      new TileLayer({
        qgisname: layer.qgisname,
        mapproxy: layer.mapproxy,
        type: layer.type,
        source: layerSource,
        showlegend: layer.showlegend,
        visible: layer.visible,
        hidden: layer.hidden,
        children: layer.children,
        fields: layer.fields,
        indentifiable: layer.indentifiable,
      });

    if (!layer.name.startsWith("@"))
      newLayer.set("title", layer.name);

    wmsLayers.push(newLayer);

    return newLayer;
  }
}

function selectFeatureInfo(coordinates) {

  //console.log(coordinates);

  $("#windowFeature .content-layers").empty();

  wmsLayers.forEach(function(layerObj) {

    //console.log(layerObj);
    //console.log(layerObj.get('title'), layerObj.getVisible());

    let cssId = makeSafeForCSS(layerObj.get('qgisname'));
      
    // getFeatureInfo for every layer/group
    if (layerObj.getVisible() && layerObj.get("indentifiable")) {
      // get layer info

      //console.log(layerObj.get('title'), qgisSources[layerObj.get('title')]);

      let url = qgisSources[layerObj.get('title')].getFeatureInfoUrl(
        coordinates, 
        map.getView().getResolution(), 
        map.getView().getProjection(),
        { 'INFO_FORMAT': 'text/xml' }
      );

      if (url) {
        url += "&MAP=" + qgisProjectFile;
        //console.log(layerObj.get('qgisname'), url);

        fetch(url, {
          mode: 'same-origin', // no-cors, *cors, same-origin
        })
        .then((response) => response.text())
        .then((xml) => {

          let xmlDoc = $.parseXML(xml), 
              $xml = $(xmlDoc);

          let i = 0;
          // for each Layer
          $($xml.find('Layer')).each(function() {
            let layer = $(this),
                layerName = layer.attr('name'),
                htmlDiv = '<div class="layer-'+cssId+'-'+i+'"></div>',
                htmlTitle = '<h3>'+layerName+'</h3><ul class="list">',
                htmlLi = '';

            // for each Feature
            $(layer.find('Feature')).each(function(){

              if ($(this).children().length > 0) {

                // for each Attribute
                $(this).find("Attribute").each(function(j, elem){
                  let name = $(elem).attr("name"),
                      value = $(elem).attr("value");

                  // only show fields which do show up in JSON
                  if (fieldIsVisible(name, layerName, layerObj)) {

                    // check if NULL
                    if (value === "NULL")
                      value = "";
                    // check if url
                    if (value && value.startsWith("http"))
                      value = '<a href="'+value+'" target="_blank">'+value+'</a>';
                    if (parseFloat(value) === 0)
                      value = "";
                    // check if float
                    if(!isNaN(parseFloat(value)))
                      // check if has decimals
                      if (value % 1 != 0)
                        value = parseFloat(value).toLocaleString('es-ES', { decimal: ',', useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });

                    if (value !== "")
                      htmlLi += '<li>'+name+': <span class="field-content">'+value+'</span></li>';
                  }
                });
              }
            });

            if (htmlLi != '' /*&& iconPoint.getCoordinates()[0] === coordinates[0] && iconPoint.getCoordinates()[1] === coordinates[1]*/) {

              $("#windowFeature .content-layers").append(htmlDiv);
              $("#windowFeature .content-layers .layer-"+cssId+'-'+i).append(htmlTitle);
              $("#windowFeature .content-layers .layer-"+cssId+'-'+i+" .list").append(htmlLi);
            }

            i++;
          });
        });
      }
    }
    else if (layerObj.getVisible() && layerObj.get("type") === "group") {
      selectFeatureInfo(coordinates);
    }
  });

  windowFeature.show();
}

function fieldIsVisible(fieldName, layerName, layerGroup) {
  if (layerGroup.get("type") === "group") {
    // group
    for (let i=0; i<layerGroup.get("children").length; i++) {
      let childLayer = layerGroup.get("children")[i];
      if (layerName === childLayer["name"] && fieldIsVisibleInLayer(fieldName, childLayer)) {
        return true;
      }
    }
    return false;
  }
  else {
    // layer
    return fieldIsVisibleInLayer(fieldName, layerGroup["values_"]);
  }
}

function fieldIsVisibleInLayer(fieldName, childLayer) {
  if (childLayer["indentifiable"] && childLayer.hasOwnProperty("fields")) {
    return (childLayer["fields"].find(function (element) {
      return (element.name === fieldName)
    }) !== undefined);
  }
  return false;
}

/*
  Geocoder
  ****************************************/
const searchSource = new VectorSource();
map.addLayer(new VectorLayer({
  source: searchSource,
  style: new Style({
    fill: new Fill({
      color: 'rgba(0,0,0,0)'
    }),
    stroke: new Stroke({
      color: 'rgb(255,165,0)',
      width: 1
    })
  }),
  hidden: true
}));

fetch(
  "https://nominatim.openstreetmap.org/search.php?city=barcelona&polygon_geojson=1&format=geojson&limit=1"
)
.then(function (response) {
  return response.json();
})
.then(function (json) {
  const features = new GeoJSON().readFeatures(json);
  const geometry = features[0].getGeometry();
  const originalGeometry = geometry.clone();
  const extent = originalGeometry.getExtent();
  geometry.transform("EPSG:4326", map.getView().getProjection());
  searchSource.addFeature(features[0]);

  const search = new SearchNominatim({
    viewbox: extent,
    bounded: 1
  });

  search.handleResponse = function (response) {
    return response.filter(function (entry) {
      const coordinate = [entry.lon, entry.lat].map(Number);
      return originalGeometry.intersectsCoordinate(coordinate);
    });
  };

  search.on("select", function (e) {
    map.getView().animate({
      center: e.coordinate,
      zoom: Math.max(map.getView().getZoom(), 15)
    });
  });

  map.getView().fit(geometry);
  map.addControl(search);
});

/*
  Export map as PNG image
  ****************************************/
map.addControl(new Button ({
  //html: '<i class="fa fa-smile-o"></i>',
  html: 'D',
  className: "exportBtn",
  title: "Export PNG",
  handleClick: function() {
    exportPng();
  }
}));

function exportPng() {
  map.once('rendercomplete', function () {
    const mapCanvas = document.createElement('canvas');
    const size = map.getSize();
    mapCanvas.width = size[0];
    mapCanvas.height = size[1];
    const mapContext = mapCanvas.getContext('2d');
    Array.prototype.forEach.call(
      map.getViewport().querySelectorAll('.ol-layer canvas, canvas.ol-layer'),
      function (canvas) {
        if (canvas.width > 0) {
          const opacity =
            canvas.parentNode.style.opacity || canvas.style.opacity;
          mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);
          let matrix;
          const transform = canvas.style.transform;
          if (transform) {
            // Get the transform parameters from the style's transform matrix
            matrix = transform
              .match(/^matrix\(([^\(]*)\)$/)[1]
              .split(',')
              .map(Number);
          } else {
            matrix = [
              parseFloat(canvas.style.width) / canvas.width,
              0,
              0,
              parseFloat(canvas.style.height) / canvas.height,
              0,
              0,
            ];
          }
          // Apply the transform to the export map context
          CanvasRenderingContext2D.prototype.setTransform.apply(
            mapContext,
            matrix
          );
          const backgroundColor = canvas.parentNode.style.backgroundColor;
          if (backgroundColor) {
            mapContext.fillStyle = backgroundColor;
            mapContext.fillRect(0, 0, canvas.width, canvas.height);
          }
          mapContext.drawImage(canvas, 0, 0);
        }
      }
    );
    mapContext.globalAlpha = 1;
    mapContext.setTransform(1, 0, 0, 1, 0, 0);
    const link = document.getElementById('image-download');
    link.href = mapCanvas.toDataURL();
    link.click();
  });
  map.renderSync();
}

function makeSafeForCSS(name) {
  if (name)
    return name.replace(/[^a-z0-9\_\-]/g, function(s) {
      var c = s.charCodeAt(0);
      if (c == 32) return '-';
      if (c >= 65 && c <= 90) return '_' + s.toLowerCase();
      return '__' + ('000' + c.toString(16)).slice(-4);
    });
  else
    return "";
}
