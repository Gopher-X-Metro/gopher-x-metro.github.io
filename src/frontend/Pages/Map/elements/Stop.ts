import L from 'leaflet';
import Live from 'src/backend/Live.ts';
import InfoWindowElement from './abstracts/InfoWindowElement';

import Resources from 'src/backend/Resources.ts';
import RouteURL from 'src/backend/URL.ts';
import Alerts from 'src/backend/Alerts.ts';
import { routeLabel } from 'src/backend/RouteNames.ts';
import Primative from './abstracts/Primative';

interface departure {
    routeId: string;
    tripId: string;
    departure_text: string;
    departure_time: number;
    direction_text: string;
    description: string;
}

class Stop extends InfoWindowElement {
    /* Public */

    /** Routes on the map that serve this stop */
    public routeIds = new Set<string>();
    /** Routes at this stop with no service today */
    public inactiveRouteIds = new Set<string>();

    /**
     * Stop Constructor
     * @param stopId ID of the stop
     * @param color color of the stop
     * @param location location of the stop
     * @param map map the stop displays on
     */
    constructor(stopId: string, color: string, name: string, direction: string, location: L.LatLng, map: L.Map) {
        super(stopId, map, L.circleMarker(location, {
            fillColor: color,
            fillOpacity: 1,
            weight: stopSize(map.getZoom()).weight,
            color: color,
            radius: stopSize(map.getZoom()).radius,
            opacity: 0.35,
            bubblingMouseEvents: false,
            pane: stopPane(map)
        }));

        this.name = name;
        this.direction = direction;

        // Rings the stop while its popup is open, so it's clear which stop the times are for
        let highlight: L.LayerGroup | undefined;
        this.infoWindow.getWindow().on("add", () => {
            highlight?.remove();
            const ring = { color: "#ffcc33", fill: false, interactive: false, pane: stopPane(map) };
            highlight = L.layerGroup([
                L.circleMarker(location, { ...ring, radius: 13, weight: 4 }),
                L.circleMarker(location, { ...ring, radius: 16, weight: 4, className: "focus-ring" }),
            ]).addTo(map);
        });
        this.infoWindow.getWindow().on("remove", () => { highlight?.remove(); highlight = undefined; });

        this.updateWindow();
    }
    /**
     * Updates the info window information
     */
    public async updateWindow() : Promise<void> {
        this.setColor(this.departures.size === 0 ? STOP_IDLE : STOP_ACTIVE);
        // Rail stations have a stop per direction at almost the same spot; keep the one with service on top (stops have their own pane, so this never hides them under route lines)
        const marker = this.marker as L.CircleMarker;
        if (this.departures.size > 0) marker.bringToFront(); else marker.bringToBack();

        /**
         * Generate the content of the infowindow
         * @param errorMessage  the error message to replace the content
         */
        const generateContent = async (errorMessage?: string) => {
            const divElement = document.createElement("div");
            divElement.className = "stop-popup";

            const nameElement = document.createElement("h3");
            nameElement.textContent = this.name;
            divElement.appendChild(nameElement);

            if (this.direction) {
                const directionElement = document.createElement("p");
                directionElement.className = "stop-popup-direction";
                directionElement.textContent = this.direction;
                divElement.appendChild(directionElement);
            }

            if (errorMessage) {
                const errorElement = document.createElement("p");
                errorElement.className = "stop-popup-empty";
                errorElement.textContent = errorMessage;
                divElement.appendChild(errorElement);
            } else if (this.departures.size === 0) {
                const warningElement = document.createElement("p");
                warningElement.className = "stop-popup-empty";
                const allInactive = this.routeIds.size > 0 && [...this.routeIds].every(id => this.inactiveRouteIds.has(id));
                warningElement.textContent = allInactive
                    ? "Sorry, this route is not active right now, please check the scheduling page for more information. "
                    : `No ${this.serviceKind()} scheduled here right now. `;
                const link = document.createElement("a");
                // Prefer a route that's currently shown on the map
                const routeId = [...this.routeIds].find(id => RouteURL.getRoutes().has(id)) ?? [...this.routeIds][0];
                link.textContent = "See schedule";
                link.href = "#";
                link.addEventListener("click", event => {
                    event.preventDefault();
                    if (routeId) document.dispatchEvent(new CustomEvent("gxm:open-schedule", { detail: routeId }));
                    document.dispatchEvent(new CustomEvent("gxm:open-page", { detail: "schedules" }));
                });
                warningElement.appendChild(link);
                divElement.appendChild(warningElement);
            } else {
                // One row per route: tappable route chip, then its next few times
                const listElement = document.createElement("ul");
                // Work from a snapshot: departures can refresh while colors load, which would repeat rows
                const snapshot = [...this.departures].map(([routeId, departures]) => [routeId, [...departures]] as [string, departure[]]);
                const colors = await Promise.all(snapshot.map(([routeId]) => Resources.getColor(routeId)));
                for (const [i, [routeId, departures]] of snapshot.entries()) {
                    const row = document.createElement("li");

                    const chip = document.createElement("button");
                    chip.className = "stop-popup-chip";
                    chip.textContent = chipLabel(routeId);
                    chip.style.background = "#" + colors[i];
                    chip.title = RouteURL.getRoutes().has(routeId) ? "Hide this route" : "Show this route on the map";
                    chip.addEventListener("click", event => {
                        event.stopPropagation();
                        if (!RouteURL.getRoutes().has(routeId)) RouteURL.addRoute(routeId);
                        else RouteURL.removeRoute(routeId);
                    });
                    row.appendChild(chip);

                    const times = document.createElement("span");
                    times.className = "stop-popup-times";
                    departures.slice(0, DEPARTURES_SHOWN).forEach((departure, i) => {
                        const time = document.createElement("span");
                        time.textContent = Live.formatDeparture(departure.departure_text, departure.departure_time);
                        if (i === 0) time.className = "next";
                        times.appendChild(time);
                    });
                    row.appendChild(times);
                    row.appendChild(Alerts.routeBell(this.getId(), this.name, chipLabel(routeId),
                        departures.map(d => ({ tripId: d.tripId, time: d.departure_time }))));
                    listElement.appendChild(row);
                }
                divElement.appendChild(listElement);
            }

            return divElement;
        }

        // Load infowindow; if a newer update started meanwhile, let it win
        const build = ++this.builds;
        try {
            const content = await generateContent();
            if (build === this.builds) this.infoWindow?.setContent(content);
        } catch (e) {
            console.error(`Failed to update info window:`, e);
            this.infoWindow?.setContent(await generateContent("Failed to load departure information."));
        }
    }
    /**
     * Adds a departure to the route
     * @param routeId            route the departure is for
     * @param tripId             the trip id of the departure
     * @param departure_text     text of the departure time
     * @param direction_text     text of departure direction
     * @param description        description of departure
     * @param departure_time     time of departure epoch
     */
    public addDeparture(routeId: string, tripId: string, departure_text: string, direction_text: string, description: string, departure_time: number) : void {
        if (!this.departures.has(routeId)) this.departures.set(routeId, []);
        this.departures.get(routeId)!.push({ routeId, tripId, departure_text, direction_text, description, departure_time });
    }
    /**
     * Clears all departures
     */
    public clearDepartures() : void { this.departures.clear() }
    /** The stop's name as shown on the map */
    public getName() : string { return this.name; }
    /**
     * What serves this stop, in words: light rail, buses, or both
     */
    private serviceKind() : string {
        const ids = [...this.routeIds];
        const rail = ids.some(id => LIGHT_RAIL.has(id));
        const bus = ids.some(id => !LIGHT_RAIL.has(id));
        return rail && bus ? "buses or light rail" : rail ? "light rail" : "buses";
    }
    /**
     * Changes the color of the stop
     * @param color  the new color
     */
    public setColor(color: string) : void {
        (this.marker as L.CircleMarker).setStyle({ fillColor: color, color: color });
    }
    /**
     * Resizes the stop for the map's zoom level
     * @param zoom the map's zoom level
     */
    public setZoomSize(zoom: number) : void {
        const size = stopSize(zoom);
        (this.marker as L.CircleMarker).setRadius(size.radius);
        (this.marker as L.CircleMarker).setStyle({ weight: size.weight });
    }
    /**
     * Adds an element to the set of elements
     * @param element   the element to add
     */
    public addElement(element: Primative) : void { this.elements.add(element); }
    /**
     * Updates the visibility baised on which elements are visible
     */
    public updateVisibility() : void {
        this.setVisible([...this.elements].some(element => element.isVisible()));
    }
 
    /* Private */

    private name: string;
    private builds = 0;
    private departures = new Map<string, Array<departure>>();
    private direction: string;
    private elements = new Set<Primative>();
}

const DEPARTURES_SHOWN = 5;

// Below this zoom, bus stops ~250 m apart are closer than a stop dot is wide
const STOPS_MIN_ZOOM = 14;

// Stops with upcoming buses stand out; ones without fade back
const STOP_ACTIVE = "#1f5fbf";
const STOP_IDLE = "#9aa3ad";

// Light rail lines, so their stops can say what runs there
const LIGHT_RAIL = new Set(["901", "902"]);

/** Short label for a route chip: "Blue" rather than "Blue Line" */
const chipLabel = (routeId: string) => routeLabel(routeId).replace(/^(Blue|Green) Line$/, "$1");

/** Stops get their own layer above route lines, so a line never covers a stop's tap target */
function stopPane(map: L.Map) : string {
    if (!map.getPane("stops")) {
        const pane = map.createPane("stops");
        pane.style.zIndex = "450";
        // Zoomed out, a route's stops pile into one thick smear, so they hide until there's room to tell them apart
        const fit = () => { pane.style.display = map.getZoom() < STOPS_MIN_ZOOM ? "none" : ""; };
        map.on("zoomend", fit);
        fit();
    }
    return "stops";
}

/** Stops shrink when zoomed in close, so stops on opposite sides of a street don't overlap */
function stopSize(zoom: number) : { radius: number, weight: number } {
    if (zoom >= 18) return { radius: 5, weight: 5 };
    if (zoom >= 17) return { radius: 6, weight: 7 };
    return { radius: 7, weight: 10 };
}

export default Stop;
