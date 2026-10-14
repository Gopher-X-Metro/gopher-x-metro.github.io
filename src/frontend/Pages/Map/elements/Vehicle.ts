import L from "leaflet";
import InfoWindowElement from "./abstracts/InfoWindowElement";
import Live from "src/backend/Live.ts";
import Resources from "src/backend/Resources.ts";
import { ROUTE_NAMES } from "src/backend/RouteNames.ts";
import Predictions from "src/backend/Predictions.ts";

class Vehicle extends InfoWindowElement {
    /* Public */

    /**
     * Vehicle Constructor
     * @param vehicleId vehicle ID
     * @param routeId route the vehicle runs, tagged above its icon
     * @param images [vehicle, arrow] images
     * @param map map the vehicle displays on
     */
    constructor (vehicleId: string, routeId: string, images: [string, string], map: L.Map) {
        const contents = document.createElement("div");
        contents.style.position = "relative";

        super(vehicleId, map, L.marker([0, 0], {
            icon: L.divIcon({ html: contents, className: "", iconSize: [0, 0] }),
        }), [0, -15]);

        // Create bus container
        const busContainer = document.createElement("div");
        busContainer.style.position = "absolute";
        busContainer.style.transform = "translate(-50%, -50%)";

        // Create arrow container
        const arrowContainer = document.createElement("div");
        arrowContainer.style.position = "absolute";
        arrowContainer.style.transform = "translate(-50%, -50%)";

        // Create bus image
        const busImage = document.createElement("img")
        busImage.src = images[0];
        busImage.style.width = "25px";
        busContainer.appendChild(busImage);

        // Create arrow image
        const arrowImage = document.createElement("img")
        arrowImage.src = images[1];
        arrowImage.style.width = "40px";
        arrowContainer.appendChild(arrowImage);

        // Store reference to arrow image and container
        this.arrowImg = arrowImage;
        this.arrowCont = arrowContainer;

        contents.appendChild(busContainer);
        contents.appendChild(arrowContainer);

        // Route number tag above the icon, in the route's color, so similar colors are easy to tell apart
        const tag = document.createElement("div");
        tag.className = "route-tag";
        tag.textContent = ROUTE_TAGS[routeId] ?? routeId;
        contents.appendChild(tag);
        Resources.getColor(routeId).then(color => {
            const hex = "#" + color.replace("#", "");
            tag.style.background = hex;
            tag.style.color = isLight(hex) ? "#1a1a1a" : "#ffffff";
        });

        // Red "+N" badge for campus buses running late
        this.badge = document.createElement("div");
        this.badge.className = "delay-badge";
        this.badge.hidden = true;
        contents.appendChild(this.badge);

        // Predicted-late dot on the bus's corner, green when usually on time, amber when late is likely
        this.dot = document.createElement("div");
        this.dot.className = "predict-dot";
        this.dot.hidden = true;
        contents.appendChild(this.dot);
    }
    /**
     * Stores the past-run prediction for the vehicle's trip and shows its dot
     * @param prediction the trip's prediction, or undefined when there is none
     */
    public setPrediction(prediction: Predictions.Prediction | undefined) : void {
        this.prediction = prediction;
        this.dot.hidden = !(prediction && Predictions.isShown());
        this.dot.className = "predict-dot " + (prediction?.risk === "late" ? "predict-late" : "predict-on-time");
        this.dot.title = prediction?.risk === "late" ? "Often runs late on this trip" : "Usually on time for this trip";
    }
    /**
     * Stores the latest realtime data of the vehicle
     * @param routeId   route the vehicle is running
     * @param info      realtime data from Metro Transit or Peak Transit
     */
    public setInfo(routeId: string, info: any) : void {
        this.routeId = routeId;
        this.info = info;

        const late = info?.nextStopID ? info.minsLate : 0;
        this.badge.hidden = !(late > 1);
        if (late > 1) {
            this.badge.textContent = "+" + late;
            this.badge.title = `About ${late} minutes late`;
        }
    }
    /**
     * Dims stale vehicles and refreshes the info window while it is open
     */
    public updateWindow() {
        const stale = (this.getLastUpdated() ?? 0) > STALE_SECONDS;
        (this.marker as L.Marker).setOpacity(stale ? 0.4 : 1);

        if (!this.infoWindow?.isVisible()) {
            this.windowUpdated = 0;
            return;
        }
        if (Date.now() - this.windowUpdated < 5000) return;
        // Placeholder while the next stop and route details load
        if (this.windowUpdated === 0) this.infoWindow?.setContent(`<div class="vehicle-popup"><p class="muted">Loading bus info…</p></div>`);
        this.windowUpdated = Date.now();

        this.buildWindow().then(content => this.infoWindow?.setContent(content));
    }
    /**
     * Builds the info window: route, direction, next stop, and how fresh the position is
     */
    private async buildWindow() : Promise<HTMLElement> {
        const div = document.createElement("div");
        div.className = "vehicle-popup";
        const info = this.info ?? {};
        const routeId = this.routeId ?? "";

        const title = document.createElement("h3");
        const color = await Resources.getColor(routeId);
        title.innerHTML = `<span class="route-dot" style="background:#${color}"></span>`;
        title.append(ROUTE_NAMES[routeId] ?? "Route " + routeId);
        div.appendChild(title);

        const lines: string[] = [];
        if (info.direction) lines.push(DIRECTIONS[info.direction] ?? info.direction);

        let nextStop: string | undefined;
        let nextStopId: string | undefined;
        let eta: number | undefined;
        let metro: Live.MetroTrip | undefined;
        let offDuty = false;
        let atStop = false;
        if (info.nextStopID) {
            let peakStopId: number = info.nextStopID;
            nextStopId = "peak-" + peakStopId;
            // Peak's next stop can lag a bus that just left a stop, so place the bus on its route to find the real one
            const located = await Live.locatePeakBus(routeId, info);
            if (located) {
                nextStopId = located.stopId;
                atStop = located.at;
                const stop = (await Live.getStops()).find(s => s[0] === located.stopId);
                const peakStop = stop && (await Live.getPeakRouteStops(info.routeID))
                    .find(s => Math.hypot((s.lat - stop[2]) * 111000, (s.lng - stop[3]) * 79000) < 120);
                peakStopId = peakStop?.id ?? 0;
            }
            // Use the map's name for the stop when it's drawn, so the popup and the stop agree
            nextStop = await stopNameLookup?.(nextStopId) ?? (located ? await Live.getStopName(nextStopId) : (await Live.getPeakStop(peakStopId))?.name);
            const [arrival] = peakStopId ? await Live.getPeakArrivals(peakStopId, info.routeID) : [];
            if (arrival) eta = Math.round((arrival - Date.now() / 1000) / 60);
            // Peak's ETA is the route's next arrival at that stop, not this bus's. If the route isn't due there for
            // over an hour, this bus isn't serving it: it's finishing up (often the night's last run, maybe running late)
            if (eta !== undefined && eta > 60) { eta = undefined; offDuty = true; }
        } else if (!this.id.startsWith("peak-")) {
            metro = await Live.getMetroTrip(this.id, this.routeId);
            nextStop = metro.nextStop;
            nextStopId = metro.nextStopId;
            if (metro.arrival) eta = Math.round((metro.arrival - Date.now() / 1000) / 60);
        }
        if (offDuty) {
            const hour = new Date().getHours();
            lines.push(hour >= 20 || hour < 5 ? "Done for the night" : "Going out of service");
        } else if (nextStop) lines.push((metro?.stopped || atStop ? "At stop: " : "Next stop: ") + nextStop + (!(metro?.stopped || atStop) && eta !== undefined && eta >= 0 ? ` (${eta === 0 ? "now" : eta + " min"})` : ""));
        // No trip assigned (e.g. Peak sends nextStopID 0 at a layover): GPS is live but there's no stop or schedule
        else if (!info.nextStopID && metro?.delayMinutes === undefined) lines.push("Between trips (no stop info yet)");
        if (metro?.delayMinutes !== undefined)
            lines.push(metro.delayMinutes > 1 ? `About ${metro.delayMinutes} min late` : metro.delayMinutes < -1 ? `About ${-metro.delayMinutes} min early` : "On time");

        // Campus buses report schedule adherence and how full they are
        if (!offDuty && info.nextStopID && info.minsLate !== undefined)
            lines.push(info.minsLate > 1 ? `About ${info.minsLate} min late` : info.minsLate < -1 ? `About ${-info.minsLate} min early` : "On time");
        if (info.HasAPC && info.APCPercentage > 0)
            lines.push(info.APCPercentage >= 90 ? "Crowded (standing room only)" : info.APCPercentage >= 50 ? "Some seats open" : "Plenty of seats");

        const age = Math.round(this.getLastUpdated() ?? 0);
        lines.push(age > STALE_SECONDS 
            ? `Location may be out of date (${Math.round(age / 60)} min old)` 
            : `Location updated ${age < 5 ? "just now" : age + "s ago"}`);

        // Past runs of this trip (not this bus's live delay), from the published history
        if (this.prediction)
            lines.push(this.prediction.risk === "late" ? "Past runs: often late" : "Past runs: usually on time");

        const busNumber = metro?.busNumber ?? info.vehicleName;
        if (busNumber) lines.push("Bus #" + busNumber);

        lines.forEach((line, i) => {
            const p = document.createElement("p");
            // The next stop's name opens that stop's departures
            const label = line.match(/^(Next stop|At stop): /)?.[0];
            if (label && nextStop && nextStopId) {
                const link = document.createElement("a");
                link.href = "#";
                link.className = "next-stop-link";
                link.textContent = nextStop;
                link.title = "Show this stop's departures";
                const id = nextStopId;
                link.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    document.dispatchEvent(new CustomEvent("gxm:open-stop", { detail: id }));
                });
                p.append(label, link, line.slice(label.length + nextStop.length));
            } else p.textContent = line;
            if (i === lines.length - 1) p.className = "muted";
            // Live delay: red when late or early (off schedule), green when on time
            if (/^About \d+ min (late|early)$/.test(line)) p.classList.add("delay-off");
            else if (line === "On time") p.classList.add("delay-ok");
            div.appendChild(p);
        });
        return div;
    }
    /**
     * Gets the length in ms of the time between when position was updated and now
     */
    public getLastUpdated() : number | undefined {
        if (this.positionTimestamp)
            return (Date.now()/1000) - this.positionTimestamp; 
    }
    /**
     * Sets the position of the vehicle on the map
     * @param position position of the vehicle
     * @param timestamp when this position was updated
     */
    public setPosition(position : L.LatLng, timestamp : number) : void {
        if (!(this.marker as L.Marker).getLatLng().equals(position)) {
            this.infoWindow?.setPosition(position);
            this.glideTo(position);
        }
        // A bus waiting at a layover reports the same spot with a fresh time; it's still live
        if (timestamp) this.positionTimestamp = timestamp;
    }
    /**
     * Moves the icon smoothly to a new position instead of jumping
     * @param position the new position
     */
    private glideTo(position: L.LatLng) : void {
        const marker = this.marker as L.Marker;
        const from = marker.getLatLng();
        if (this.glide) cancelAnimationFrame(this.glide);

        // Jump when there's nothing to glide from, the tab is hidden, or the move is too far to be driving
        if ((from.lat === 0 && from.lng === 0) || document.hidden || from.distanceTo(position) > 1500) {
            marker.setLatLng(position);
            return;
        }

        const start = performance.now();
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / GLIDE_MS);
            const ease = t * (2 - t);
            marker.setLatLng([from.lat + (position.lat - from.lat) * ease, from.lng + (position.lng - from.lng) * ease]);
            if (t < 1) this.glide = requestAnimationFrame(step);
        };
        this.glide = requestAnimationFrame(step);
    }
    /**
     * Sets the direction the bus is heading
     * @param bearing the orientation of the bus
     */
    public setBusBearing(bearing: number): void {
        if (this.arrowImg) {
            this.arrowImg.style.transform = `rotate(${bearing}deg)`;
            this.setArrowImageOrientation(bearing);
        }
    }
    /**
     * Returns if the vehicle position has been updated
     */
    public isPositionUpdated(): boolean { return this.getLastUpdated() as number < 300 }
    /**
     * Sets the updated status of the vehicle
     * @param bool the new updated status
     */
    public updateTimestamp() : void { this.updatedTimestamp = Date.now(); }
    /**
     * Returns if the vehicle had been updated
     */
    public isUpdated(): boolean { return (this.updatedTimestamp && this.isPositionUpdated()) ? (Date.now() - this.updatedTimestamp < 500) : false; }
    /**
     * Points a light rail train's arrow along its line, which only runs one way per direction
     * @param routeId       901 (Blue Line) or 902 (Green Line)
     * @param direction_id  the train's direction
     */
    public setRailDirection(routeId: "901" | "902", direction_id: number): void {
        const bearing = RAIL_BEARINGS[routeId][direction_id];
        if (bearing !== undefined) this.setBusBearing(bearing);
    }
    /**
     * Sets position of bus arrow image around center of bus image
     * @param bearing the orientation of the bus
     */
    public setArrowImageOrientation(bearing: number) : void {
        const radius = 10;
        const radians = (bearing + 90) / 180 * Math.PI;
        
        if (this.arrowCont) {
            this.arrowCont.style.top = (-Math.sin(radians) * radius).toString() + "px";
            this.arrowCont.style.left = (-Math.cos(radians) * radius).toString() + "px";
        }
    }
    
    /* Private */
    private routeId: string | undefined;
    private info: any;
    private windowUpdated = 0;
    private glide = 0;
    private badge: HTMLDivElement;
    private dot: HTMLDivElement;
    private prediction: Predictions.Prediction | undefined;
    private updatedTimestamp: number | undefined;
    private positionTimestamp : number | undefined;
    private arrowImg: HTMLImageElement | null = null;
    private arrowCont: HTMLDivElement;
}

const STALE_SECONDS = 120;
// Tag text where the route number isn't what riders call it
const ROUTE_TAGS: Record<string, string> = { "901": "Blue", "902": "Green", "925": "E", "FOOTBALL": "Game day" };

/** If dark text reads better than white on this color */
function isLight(hex: string) : boolean {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}
// Blue Line runs north-south (0 = north), Green Line east-west (0 = east)
const RAIL_BEARINGS = { "901": [0, 180], "902": [90, 270] };
const GLIDE_MS = 1500;

const DIRECTIONS = { NB: "Northbound", SB: "Southbound", EB: "Eastbound", WB: "Westbound" };

let stopNameLookup: ((stopId: string) => Promise<string | undefined>) | undefined;
/**
 * Lets the map supply stop names for bus popups (set by Routes, which imports this file)
 * @param lookup gets a stop's name as the map shows it
 */
export function setStopNameLookup(lookup: (stopId: string) => Promise<string | undefined>) : void { stopNameLookup = lookup; }


export default Vehicle;