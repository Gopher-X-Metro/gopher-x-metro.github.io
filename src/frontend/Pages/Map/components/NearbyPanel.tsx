import React, { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import Live from "src/backend/Live";
import Resources from "src/backend/Resources";
import RouteURL from "src/backend/URL";
import Alerts from "src/backend/Alerts";
import Delays from "src/backend/Delays";

interface StopView {
    id: string;
    name: string;
    lat: number;
    lng: number;
    meters?: number;
    departures?: Live.Departure[];
    alerts?: string[];
    error?: boolean;
}

const FAVORITES_KEY = "gxm-favorite-stops";
const PANEL_CLOSED_KEY = "gxm-nearby-closed";

function panelClosed() : boolean {
    try { return localStorage.getItem(PANEL_CLOSED_KEY) === "1"; } catch { return false; }
}

/** A departure the rider asked to be told about */

/** Reads saved stops, which may be unavailable in private browsing */
function loadFavorites() : StopView[] {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]"); } catch { return []; }
}

function saveFavorites(favorites: StopView[]) : void {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.map(({ id, name, lat, lng }) => ({ id, name, lat, lng })))); } catch {}
}

/**
 * Panel listing favorite and nearby stops with their next departures and walking times
 */
export default function NearbyPanel({ map, isMobile }: { map: L.Map | null, isMobile: boolean }) {
    const [favorites, setFavorites] = useState<StopView[]>(loadFavorites);
    const [nearby, setNearby] = useState<StopView[]>([]);
    // Opens on its own so departures are the first thing a rider sees, except on phones where it would cover the map
    // (closing it is remembered)
    const [open, setOpenState] = useState(() => !window.matchMedia("(max-width: 1024px)").matches && !panelClosed());
    const setOpen = (next: boolean) => {
        try { localStorage.setItem(PANEL_CLOSED_KEY, next ? "" : "1"); } catch {}
        setOpenState(next);
    };
    // Nearby search: idle -> searching -> found | fallback | none | failed (see NEARBY_MESSAGES)
    const [status, setStatus] = useState<NearbyStatus>("idle");
    const latestSearch = useRef(0);
    const [colors, setColors] = useState<Record<string, string>>({});
    // Routes shown on the map; departure chips toggle them, same as the sidebar route buttons
    const [shownRoutes, setShownRoutes] = useState<Set<string>>(() => RouteURL.getRoutes());
    useEffect(() => RouteURL.addListener(() => setShownRoutes(RouteURL.getRoutes())), []);
    // Reads the URL, not state, since stop popups keep this function after the state changes
    const toggleRoute = (routeId: string) =>
        RouteURL.getRoutes().has(routeId) ? RouteURL.removeRoute(routeId) : RouteURL.addRoute(routeId);
    const [position, setPosition] = useState<{ lat: number, lng: number } | null>(null);
    const container = useRef<HTMLDivElement>(null);
    const [notice, setNotice] = useState("");
    // Re-render when alerts change anywhere (this panel or a stop popup), and show their messages
    const [, setAlertsVersion] = useState(0);
    useEffect(() => Alerts.addListener(() => setAlertsVersion(v => v + 1)), []);
    // Delay estimates for scheduled (not yet tracked) departures, loaded after the departures show;
    // only confident ones come back, keyed "stopId|tripId"
    const [estimates, setEstimates] = useState<Record<string, Delays.Estimate>>({});
    useEffect(() => {
        let cancelled = false;
        Promise.all([...favorites, ...nearby].map(async stop =>
            [...(await Delays.estimates(stop.id, stop.departures ?? []))].map(([tripId, e]) => [stop.id + "|" + tripId, e] as const)))
            .then(found => { if (!cancelled) setEstimates(Object.fromEntries(found.flat())); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [favorites, nearby]);

    useEffect(() => {
        if (container.current) {
            L.DomEvent.disableClickPropagation(container.current);
            L.DomEvent.disableScrollPropagation(container.current);
        }
    }, [container, open])

    /** Loads departures for a list of stops */
    const withDepartures = useCallback(async (stops: StopView[]) : Promise<StopView[]> => {
        const loaded = await Promise.all(stops.map(async stop => {
            try {
                const { departures, alerts } = await Live.getDepartures(stop.id);
                return { ...stop, departures: departures.slice(0, 4), alerts };
            } catch {
                return { ...stop, error: true };
            }
        }));
        // Route colors for the chips
        const routeIds = new Set(loaded.flatMap(stop => stop.departures?.map(d => d.routeId) ?? []));
        const found: Record<string, string> = {};
        await Promise.all([...routeIds].map(async id => { found[id] = await Resources.getColor(id); }));
        setColors(previous => ({ ...previous, ...found }));
        return loaded;
    }, [])

    /** Finds stops near the user, or near the middle of the map if location is unavailable */
    const findNearby = useCallback(() => {
        // Only the newest search may update the list (↻ can be pressed again mid-search)
        const searchId = ++latestSearch.current;
        const isLatest = () => searchId === latestSearch.current;
        setStatus("searching");
        const search = async (lat: number, lng: number, usedLocation: boolean) => {
            if (!isLatest()) return;
            setPosition({ lat, lng });
            try {
                const stops = await Live.nearestStops(lat, lng, 5, 800);
                const loaded = await withDepartures(stops);
                if (!isLatest()) return;
                setNearby(loaded);
                setStatus(stops.length === 0 ? "none" : usedLocation ? "found" : "fallback");
            } catch {
                if (isLatest()) setStatus("failed");
            }
        };
        const fallback = () => {
            const center = map?.getCenter();
            if (center) search(center.lat, center.lng, false);
            else if (isLatest()) setStatus("failed");
        };
        if (navigator.geolocation)
            navigator.geolocation.getCurrentPosition(
                p => search(p.coords.latitude, p.coords.longitude, true),
                fallback,
                { timeout: 8000, maximumAge: 60000 });
        else fallback();
    }, [map, withDepartures])

    // Loads favorites on open, then keeps everything fresh every 30 seconds
    useEffect(() => {
        if (!open) return;
        const refresh = async () => {
            setFavorites(await withDepartures(loadFavorites()));
            setNearby(current => current);
        };
        refresh();
        if (nearby.length === 0 && map) findNearby();
        const interval = setInterval(async () => {
            refresh();
            setNearby(await withDepartures(nearbyRef.current));
        }, 30000);
        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, map])

    const nearbyRef = useRef<StopView[]>([]);
    nearbyRef.current = nearby;

    const favoritesRef = useRef<StopView[]>([]);
    favoritesRef.current = favorites;

    const toggleWatch = (stop: StopView, d: Live.Departure) =>
        Alerts.toggle({ stopId: stop.id, stopName: stop.name, routeName: d.routeName, tripId: d.tripId, time: d.time });

    const isFavorite = (id: string) => favorites.some(f => f.id === id);

    const toggleFavorite = (stop: StopView) => {
        const next = isFavorite(stop.id) ? favorites.filter(f => f.id !== stop.id) : [...favorites, stop];
        saveFavorites(next);
        setFavorites(next);
    }

    // The stop picked from the list: ringed on the map with its departures window open
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const focusLayer = useRef<L.LayerGroup | null>(null);

    const clearFocus = useCallback(() => {
        focusLayer.current?.remove();
        focusLayer.current = null;
        setFocusedId(null);
    }, []);

    const focusStop = (stop: StopView) => {
        if (!map) return;
        focusLayer.current?.remove();
        map.closePopup();

        const ring = L.circleMarker([stop.lat, stop.lng], {
            radius: 16, color: "#ffcc33", weight: 4, fill: false, className: "focus-ring", interactive: false,
        });
        const popup = L.popup({ autoPanPaddingTopLeft: [20, 90], autoPanPaddingBottomRight: [60, 140] })
            .setLatLng([stop.lat, stop.lng])
            .setContent(stopPopup(stop, colors, toggleRoute));
        focusLayer.current = L.layerGroup([ring]).addTo(map);
        popup.on("remove", () => { if (focusLayer.current?.hasLayer(ring)) clearFocus(); });

        map.setView([stop.lat, stop.lng], 17, { animate: false });
        // Keep the stop clear of the panel, which covers the map's left side on desktop
        const covered = !isMobile ? container.current?.querySelector(".nearby-body")?.getBoundingClientRect().right ?? 0 : 0;
        if (covered) map.panBy([-covered / 2, 0], { animate: false });
        popup.openOn(map);
        setFocusedId(stop.id);
        if (isMobile) setOpen(false);
    }

    const walk = (stop: StopView) => {
        if (stop.meters !== undefined) return Live.walkMinutes(stop.meters);
        if (!position) return undefined;
        return Live.walkMinutes(L.latLng(position).distanceTo([stop.lat, stop.lng]));
    }

    const renderStop = (stop: StopView) => {
        const minutes = walk(stop);
        // The first departure the rider can still walk to, and how long until they need to set off
        const catchable = minutes === undefined ? undefined
            : stop.departures?.find(d => d.time * 1000 - Date.now() >= minutes * 60000);
        const leave = catchable && minutes !== undefined
            ? { in: minutesAway(catchable) - minutes, route: catchable.routeName }
            : undefined;
        return (
            <li key={stop.id} className={"stop-row" + (focusedId === stop.id ? " focused" : "")}>
                <div className="stop-head">
                    <button className="stop-name" onClick={() => focusStop(stop)} title="Show on map">{stop.name}</button>
                    <button className={"star" + (isFavorite(stop.id) ? " on" : "")}
                            onClick={() => toggleFavorite(stop)}
                            aria-label={isFavorite(stop.id) ? "Remove from favorites" : "Add to favorites"}
                            title={isFavorite(stop.id) ? "Remove from favorites" : "Add to favorites"}>
                        {isFavorite(stop.id) ? "★" : "☆"}
                    </button>
                </div>
                {minutes !== undefined && <p className="walk">🚶 {minutes} min walk</p>}
                {leave && <p className={"leave-by" + (leave.in <= 1 ? " now" : "")}>
                    {leave.in <= 1 ? "Leave now" : `Leave in ${leave.in} min`} to catch the {leave.route}
                </p>}
                {stop.alerts?.map((alert, i) => <p key={i} className="stop-alert" onClick={e => e.currentTarget.classList.toggle("full")}>⚠ {alert}</p>)}
                {stop.error && <p className="muted">Couldn't load departures.</p>}
                {stop.departures && stop.departures.length === 0 && <p className="muted">No departures soon.</p>}
                <ul className="departures">
                    {stop.departures?.map((d, i) => {
                        const late = minutes !== undefined && d.time * 1000 - Date.now() < minutes * 60000;
                        return (
                            <li key={i} className={(late ? (d.actual ? "hurry" : "late") : "") + (shownRoutes.has(d.routeId) ? " route-on" : "")} title={late ? "You may not make this one on foot" : undefined}>
                                <button className="chip" style={{ background: "#" + (colors[d.routeId] ?? "444444") }}
                                        onClick={() => toggleRoute(d.routeId)}
                                        aria-pressed={shownRoutes.has(d.routeId)}
                                        title={(shownRoutes.has(d.routeId) ? "Hide" : "Show") + ` route ${d.routeName} on the map`}>{d.routeName}</button>
                                <span className="dest" role="button" tabIndex={0} onClick={() => toggleRoute(d.routeId)} onKeyDown={e => e.key === "Enter" && toggleRoute(d.routeId)}>{d.description}</span>
                                <span className="time">{d.actual && "📡 "}{d.text}</span>
                                {!d.actual && estimates[stop.id + "|" + d.tripId] && (
                                    <span className={"delay-est " + estimates[stop.id + "|" + d.tripId].kind}
                                          title={estimates[stop.id + "|" + d.tripId].title}>
                                        {estimates[stop.id + "|" + d.tripId].text}
                                    </span>
                                )}
                                <button className={"bell" + (Alerts.isWatching(stop.id, d.tripId) ? " on" : "")}
                                        onClick={() => toggleWatch(stop, d)}
                                        aria-label={Alerts.isWatching(stop.id, d.tripId) ? "Stop alert" : "Alert me 5 minutes before"}
                                        title={Alerts.isWatching(stop.id, d.tripId) ? "Stop alert" : "Alert me 5 minutes before"}>
                                    {Alerts.isWatching(stop.id, d.tripId) ? "🔔" : "🔕"}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </li>
        );
    }

    return (
        <div ref={container} className={"nearby-panel" + (isMobile ? " mobile" : "") + (open ? " open" : "")}>
            <button className="nearby-toggle" onClick={() => { if (!open && isMobile) map?.closePopup(); setOpen(!open); }} aria-expanded={open}>
                {open ? "✕ Close" : "🚏 Stops near me"}
            </button>
            {open && (
                <div className="nearby-body">
                    {favorites.length > 0 && (<>
                        <h4>★ Favorites</h4>
                        <ul>{favorites.map(renderStop)}</ul>
                    </>)}
                    <div className="nearby-header">
                        <h4>Nearby</h4>
                        <button className="refresh" onClick={findNearby} title="Search again from your location">↻</button>
                    </div>
                    {NEARBY_MESSAGES[status] && <p className="muted">{NEARBY_MESSAGES[status]}</p>}
                    {notice && <p className="notice" onClick={() => setNotice("")}>{notice}</p>}
                    <ul>{nearby.filter(stop => !isFavorite(stop.id)).map(renderStop)}</ul>
                    <p className="muted legend">📡 = live time from a tracked vehicle. 🏃 = leaves before you could walk there (dimmed if no live bus is tracking it). Tap 🔕 to get an alert 5 min before a bus leaves. Scheduled times may note a bus that usually runs late or leaves early, <a href="https://kennedyjohnson.github.io/metro-transit-delays/" target="_blank" rel="noreferrer">from its past runs</a>.</p>
                </div>
            )}
        </div>
    )
}

type NearbyStatus = "idle" | "searching" | "found" | "fallback" | "none" | "failed";
const NEARBY_MESSAGES: Record<NearbyStatus, string> = {
    idle: "",
    searching: "Finding stops near you…",
    found: "",
    fallback: "Showing stops near the middle of the map (location unavailable).",
    none: "No stops within a 10 minute walk.",
    failed: "Couldn't load nearby stops. Tap ↻ to try again.",
};

/** Minutes until a departure, matching its shown "7 Min" text so the leave-by hint adds up */
function minutesAway(d: Live.Departure) : number {
    const shown = /^(\d+) Min/i.exec(d.text);
    if (shown) return Number(shown[1]);
    if (/^Due/i.test(d.text)) return 0;
    return Math.round((d.time * 1000 - Date.now()) / 60000);
}

/**
 * The departures window for a stop picked from the list, matching the map's stop popup:
 * one row per route with its next few times
 */
function stopPopup(stop: StopView, colors: Record<string, string>, toggleRoute: (routeId: string) => void) : HTMLElement {
    const root = document.createElement("div");
    root.className = "stop-popup";
    const name = document.createElement("h3");
    name.textContent = stop.name;
    root.appendChild(name);

    const byRoute = new Map<string, Live.Departure[]>();
    for (const d of stop.departures ?? []) byRoute.set(d.routeId, [...(byRoute.get(d.routeId) ?? []), d]);
    if (byRoute.size === 0) {
        const empty = document.createElement("p");
        empty.className = "stop-popup-empty";
        empty.textContent = stop.error ? "Couldn't load departures." : "No departures soon.";
        root.appendChild(empty);
        return root;
    }

    const list = document.createElement("ul");
    for (const [routeId, departures] of byRoute) {
        const row = document.createElement("li");
        const chip = document.createElement("button");
        chip.className = "stop-popup-chip";
        chip.textContent = departures[0].routeName;
        chip.style.background = "#" + (colors[routeId] ?? "444444");
        chip.title = "Show or hide this route on the map";
        chip.addEventListener("click", event => { event.stopPropagation(); toggleRoute(routeId); });
        row.appendChild(chip);

        const times = document.createElement("span");
        times.className = "stop-popup-times";
        departures.slice(0, 5).forEach((d, i) => {
            const time = document.createElement("span");
            time.textContent = (d.actual ? "📡 " : "") + d.text;
            if (i === 0) time.className = "next";
            times.appendChild(time);
        });
        row.appendChild(times);
        row.appendChild(Alerts.routeBell(stop.id, stop.name, departures[0].routeName, departures));
        list.appendChild(row);
    }
    root.appendChild(list);
    return root;
}
