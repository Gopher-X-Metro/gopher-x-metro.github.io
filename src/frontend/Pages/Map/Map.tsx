import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";

import Resources from "src/backend/Resources";
import Marker from "./components/Marker";
import Routes from "./components/Routes";
import PredictionLegend from "./components/PredictionLegend";
import RouteURL from "src/backend/URL";

import LoadingScreen from "./components/LoadingScreen";
import NavBar from "src/frontend/NavBar/NavBar";
import CenterButton from "src/frontend/NavBar/components/CenterButton";
import LocationSearchBar from "src/frontend/NavBar/components/LocationSearchBar";
import NearbyPanel from "./components/NearbyPanel";
import AlertBanner from "./components/AlertBanner";

const UMNLocation = { lat: 44.97369560732433, lng: -93.2317259515601 };
const defaultZoom = 15;
// Every Metro Transit stop, with a little margin
const TWIN_CITIES = L.latLngBounds([44.66, -93.80], [45.38, -92.74]);

let currentMap: L.Map | null = null;

/** The map shown on the page, for controls outside it */
export function getMap() : L.Map | null { return currentMap; }

// Water, parks and land in the palette of the campus rider map
const BASEMAP_COLORS: [string, string, string][] = [
    ["background", "background-color", "#f3f3f1"],
    ["water", "fill-color", "#9cd7ee"],
    ["waterway_river", "line-color", "#9cd7ee"],
    ["waterway_other", "line-color", "#9cd7ee"],
    ["park", "fill-color", "#dcefd6"],
    ["landcover_wood", "fill-color", "#e3f0dc"],
    ["landcover_grass", "fill-color", "#eef3ea"],
    ["landuse_residential", "fill-color", "#f3f3f1"],
    ["landuse_school", "fill-color", "#f0ede6"],
    ["building", "fill-color", "#d9d6d0"],
    ["building", "fill-outline-color", "#cac8c4"],
    ["building-3d", "fill-extrusion-color", "#dcd9d3"],
    ["road_trunk_primary", "line-color", "#ffffff"],
    ["road_secondary_tertiary", "line-color", "#ffffff"],
    ["road_motorway", "line-color", "#e3e8ef"],
    ["road_motorway_link", "line-color", "#e3e8ef"],
    ["bridge_trunk_primary", "line-color", "#ffffff"],
    ["bridge_secondary_tertiary", "line-color", "#ffffff"],
    ["bridge_motorway", "line-color", "#e3e8ef"],
    ["road_trunk_primary_casing", "line-color", "#d4d4d4"],
    ["road_secondary_tertiary_casing", "line-color", "#d4d4d4"],
    ["road_motorway_casing", "line-color", "#c9d0da"],
    ["road_path_pedestrian", "line-color", "#a9d8a9"],
    ["bridge_path_pedestrian", "line-color", "#a9d8a9"],
];

// Night palette after Google Maps' dark theme: charcoal ground, buildings a step lighter, blue-gray roads.
// Painted per layer instead of a CSS invert filter, which re-filters the whole canvas every frame while dragging
const NIGHT = {
    ground: "#212226", land: "#26272b", building: "#2e2f34", buildingEdge: "#393a40",
    park: "#1c3324", grass: "#21302a", water: "#17263c",
    minor: "#363f4c", major: "#44546a", highway: "#5a7190", casing: "#23272e", path: "#2c4232", rail: "#4a4d55",
    text: "#9aa0a6", halo: "#1b1c1f",
};

/** Night colors for every basemap layer, chosen by layer type and name */
function nightColors(gl: ReturnType<L.MaplibreGL["getMaplibreMap"]>) : [string, string, string | number][] {
    const colors: [string, string, string | number][] = [];
    for (const { id, type } of gl.getStyle().layers) {
        if (type === "background") colors.push([id, "background-color", NIGHT.ground]);
        else if (type === "symbol") {
            // Shields and arrows carry their own badge colors
            if (!/shield|arrow/.test(id)) colors.push([id, "text-color", NIGHT.text], [id, "text-halo-color", NIGHT.halo]);
        } else if (type === "fill-extrusion") colors.push([id, "fill-extrusion-color", NIGHT.building]);
        else if (type === "fill") {
            // Light pattern images (pedestrian hatch, wetland grass) that a color can't tint, so they're faded instead
            if (id === "road_area_pattern" || id === "landcover_wetland") { colors.push([id, "fill-opacity", 0.08]); continue; }
            const color = id === "building" ? NIGHT.building : id === "water" ? NIGHT.water
                : /park|wood/.test(id) ? NIGHT.park : /grass|pitch|wetland/.test(id) ? NIGHT.grass
                : id === "landuse_residential" ? NIGHT.ground : NIGHT.land;
            colors.push([id, "fill-color", color]);
            if (id === "building") colors.push([id, "fill-outline-color", NIGHT.buildingEdge]);
        } else if (type === "line" && !/boundary/.test(id)) {
            const color = /waterway/.test(id) ? NIGHT.water : /park/.test(id) ? NIGHT.park
                : /casing/.test(id) ? NIGHT.casing : /rail/.test(id) ? NIGHT.rail : /path_pedestrian/.test(id) ? NIGHT.path
                : /motorway/.test(id) ? NIGHT.highway : /trunk_primary|secondary_tertiary/.test(id) ? NIGHT.major : NIGHT.minor;
            colors.push([id, "line-color", color]);
        }
    }
    return colors;
}

// The map's own transit icons would double up with this site's stops, and road number shields and
// one-way arrows are clutter next to the bus routes (street names stay, they're how riders find stops)
const BASEMAP_HIDDEN = [
    "poi_transit",
    "road_shield_us", "highway-shield-us-interstate", "highway-shield-non-us",
    "road_one_way_arrow", "road_one_way_arrow_opposite",
];

const MPLS = { lat: 44.9778, lng: -93.265 };

/**
 * Whether the sun is down in Minneapolis (NOAA's sunrise equation, official zenith 90.833°)
 * @param now the moment to check
 */
function isNight(now = new Date()) : boolean {
    const rad = Math.PI / 180;
    const day = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
    const gamma = 2 * Math.PI / 365 * (day - 1);
    const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
        - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma);
    const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
        - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    const hourAngle = Math.acos(Math.cos(90.833 * rad) / (Math.cos(MPLS.lat * rad) * Math.cos(declination))
        - Math.tan(MPLS.lat * rad) * Math.tan(declination)) / rad;
    const solarNoon = 720 - 4 * MPLS.lng - equationOfTime;   // UTC minutes
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    // Distance from solar noon, wrapped to ±12h; the sun is up within hourAngle * 4 minutes of it
    const fromNoon = ((minutes - solarNoon + 2160) % 1440) - 720;
    return Math.abs(fromNoon) > hourAngle * 4;
}

/**
 * Labels campus buildings when zoomed in close, since the basemap leaves most of them unnamed
 * @param gl      the basemap's MapLibre map, which draws the labels
 * @param onAdded runs once the labels are on the map
 */
function addBuildingNames(gl: ReturnType<L.MaplibreGL["getMaplibreMap"]>, onAdded: () => void) {
    fetch(process.env.PUBLIC_URL + "/data/campus-buildings.json")
        .then(response => response.json())
        .then(buildings => {
            const addLabels = () => {
                if (gl.getSource("campus-buildings")) return;
                gl.addSource("campus-buildings", { type: "geojson", data: buildings });
                gl.addLayer({
                    id: "campus-building-labels",
                    type: "symbol",
                    source: "campus-buildings",
                    minzoom: 16.5,
                    layout: {
                        "text-field": ["get", "name"],
                        "text-font": ["Noto Sans Regular"],
                        "text-size": 11,
                        "text-max-width": 7,
                    },
                    paint: { "text-color": "#5f5f5f", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
                });
                onAdded();
            };
            if (gl.isStyleLoaded()) addLabels(); else gl.once("style.load", addLabels);
        })
        .catch(() => {});
}

// maplibre-gl is ~1 MB, so it loads after the map shell paints instead of blocking first paint
async function addBasemap(leafletMap: L.Map) {
    // The empty map shows while maplibre downloads, so at night it starts dark rather than flashing light
    if (isNight()) leafletMap.getContainer().style.background = NIGHT.ground;
    await Promise.all([import("maplibre-gl/dist/maplibre-gl.css"), import("@maplibre/maplibre-gl-leaflet")]);
    // OpenFreeMap's Liberty (free, no key; keeps place icons), toned down so routes and stops stand out
    const basemap = L.maplibreGL({
        style: "https://tiles.openfreemap.org/styles/liberty",
    }).addTo(leafletMap);
    const gl = basemap.getMaplibreMap();
    // Restyle once the style's layers exist (it may load before or after this runs)
    const restyle = () => {
        for (const [layer, property, color] of BASEMAP_COLORS)
            if (gl.getLayer(layer)) gl.setPaintProperty(layer, property as any, color);
        for (const layer of BASEMAP_HIDDEN)
            if (gl.getLayer(layer)) gl.setLayoutProperty(layer, "visibility", "none");
    };
    if (gl.isStyleLoaded()) restyle(); else gl.once("style.load", restyle);
    // After sunset in Minneapolis the basemap goes dark; routes and stops keep their colors
    let night: boolean | undefined;
    // Day paint of each property night overrides, so sunrise can put it back
    const dayPaint = new Map<string, [string, string, any]>();
    const applyTheme = () => {
        const now = isNight();
        if (now === night) return;
        night = now;
        if (now) {
            for (const [layer, property, color] of nightColors(gl)) {
                const key = layer + "|" + property;
                if (!dayPaint.has(key)) dayPaint.set(key, [layer, property, gl.getPaintProperty(layer, property as any)]);
                gl.setPaintProperty(layer, property as any, color);
            }
        } else {
            for (const [layer, property, color] of dayPaint.values()) gl.setPaintProperty(layer, property as any, color);
        }
    };
    // The campus labels arrive after the theme first runs, so they get it reapplied
    addBuildingNames(gl, () => { night = undefined; applyTheme(); });
    // style.load fires before tiles paint, so night never flashes the day colors first (load waits for a full render)
    if (gl.isStyleLoaded()) applyTheme(); else gl.once("style.load", () => { night = undefined; applyTheme(); });
    setInterval(applyTheme, 60000);
}

export default function MapPage({ hidden, setPage, isMobile }) {
    const [mapLoaded, setMapLoaded] = useState(false);
    const [map, setMap] = useState<L.Map | null>(null);
    const mapDiv = useRef<HTMLDivElement>(null);
    const page = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // The header's height scales with the window, so map controls are placed below its measured bottom
        const header = page.current?.querySelector(".chakra-stack") as HTMLElement | null;
        if (!header || !page.current) return;
        const update = () => page.current?.style.setProperty("--header-h", header.getBoundingClientRect().bottom + "px");
        const observer = new ResizeObserver(update);
        observer.observe(header);
        update();
        return () => observer.disconnect();
    }, [])

    useEffect(() => {
        // Creates the Leaflet map once the container exists
        if (mapDiv.current && !map) {
            const leafletMap = L.map(mapDiv.current, {
                zoomControl: false,
                // Keeps the map on the Twin Cities metro, where these routes run
                maxBounds: TWIN_CITIES,
                maxBoundsViscosity: 1,
                minZoom: 10,
            }).setView(UMNLocation, defaultZoom);
            L.control.zoom({ position: "bottomright" }).addTo(leafletMap);
            addBasemap(leafletMap);
            setMap(leafletMap);
            currentMap = leafletMap;
        }
    }, [map])

    useEffect(() => {
        // The map's size is unknown while the page is hidden
        if (map && !hidden) map.invalidateSize();
    }, [map, hidden])

    useEffect(() => {
        // Initalizes Map Component
        if (map) {
            initalize(map).then(() => setMapLoaded(true));
        }
    }, [map])

    return (
    <>
        <div ref={page} className="h-[100%] w-full bg-[#e5e3df]" hidden={hidden}>
            <NavBar setPage={setPage} isMobile={isMobile}/>
            <LoadingScreen hidden={mapLoaded}/>
            <div className="map relative h-full w-full">
                <div ref={mapDiv} className="h-full w-full z-0"/>
                <LocationSearchBar map={map} isMobile={isMobile}/>
                <CenterButton map={map}/>
                <AlertBanner/>
                <NearbyPanel map={map} isMobile={isMobile}/>
                <PredictionLegend/>
            </div>
        </div>
    </>);
}

/** Focus the map at a the UMN */
export function centerMap(map: L.Map | null) : void
/** Focus the map at a specified location */
export function centerMap(map: L.Map | null, location: {lat: number, lng: number} | L.LatLng) : void
/** Focus the map at a specific location and zoom */
export function centerMap(map: L.Map | null, location: {lat: number, lng: number} | L.LatLng, zoom: number) : void
export function centerMap(map: L.Map | null, location?: {lat: number, lng: number} | L.LatLng, zoom?: number) : void {
    if (map !== null) {
        map.setView((location === undefined) ? UMNLocation : location, (zoom === undefined) ? defaultZoom : zoom);
    }
}

async function initalize( map: L.Map ) {
    // Loads the Route's Resources
    await Resources.load()
    // Sets the Routes map to this map
    Routes.init(map)
    // Initalizes the user's marker
    // A link to routes away from campus (like ?route=777) opens looking at them, even after centering on the rider
    const showLinkedRoutes = () => Routes.showRoute(...Array.from(RouteURL.getRoutes()));
    Marker.init(map, showLinkedRoutes);
    showLinkedRoutes();

    // Updates vehicle postions every 0.5 seconds (the rider's marker follows their location on its own)
    setInterval(() => {
        Routes.refreshVehicles();
    }, 500); // ms of wait

    // Updates stops every 30 seconds
    setInterval(() => {
        Routes.refreshStops();
    }, 30000); // ms of wait
}