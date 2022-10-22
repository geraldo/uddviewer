import './style.css';
import 'ol-layerswitcher/dist/ol-layerswitcher.css';
import 'ol-ext/dist/ol-ext.css';

import {Map, View} from 'ol';
import {Tile as TileLayer, Vector as VectorLayer} from 'ol/layer';
import {Vector, BingMaps, XYZ} from 'ol/source';
import {fromLonLat} from 'ol/proj';
import {Style, Fill, Stroke, Circle} from 'ol/style';
import {GeoJSON} from 'ol/format';
import {defaults} from 'ol/control';

import LayerSwitcher from 'ol-layerswitcher';

import Button from 'ol-ext/control/Button';
import LayerSwitcherImage from 'ol-ext/control/LayerSwitcherImage';
import GeolocationButton from 'ol-ext/control/GeolocationButton';
import SearchNominatim from 'ol-ext/control/SearchNominatim';

const map = new Map({
  target: 'map',
  layers: [
    new TileLayer({
      title: 'satellite',
      baseLayer: true,
      preload: Infinity,
      source: new BingMaps({
        key: 'Ata7t8y4_jStXw5LscmH7HbH7oAkbKTGhmr5gvzHHBTETAGgUIJb4r_R3yHiZ3gJ',
        imagerySet: 'Aerial',
      }),
      visible: false
    }),
    new TileLayer({
      title: 'dark',
      baseLayer: true,
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      }),
      visible: false
    }),
    new TileLayer({
      title: 'light',
      baseLayer: true,
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
      })
    }),
  ],
  controls: defaults({
    rotateOptions: { autoHide: false}
  }),
  view: new View({
    center: fromLonLat([2.15, 41.4]),
    rotation: Math.PI/4,
    zoom: 13
  })
});

// layer menu
map.addControl(new LayerSwitcher({
  reverse: true,
  groupSelectStyle: 'group'
}));

// base layer switcher
map.addControl(new LayerSwitcherImage({
  collapsed: false,
  displayInLayerSwitcher: function(layer) {
    return (layer.get("baseLayer")); 
  }
}));

// geolocation
map.addControl(new GeolocationButton({
  title: 'Where am I?',
  delay: 2000
}));

/*
  Geocoder
  ****************************************/
const searchSource = new Vector();
map.addLayer(new VectorLayer({
  source: searchSource,
  style: new Style({
    fill: new Fill({
      color: 'rgba(0,0,0,0)'
    }),
    stroke: new Stroke({
      color: 'rgb(255,165,0)',
      width: 3
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