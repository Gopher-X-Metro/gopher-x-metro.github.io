import React, { useEffect, useState } from 'react';

import { FiChevronDown } from 'react-icons/fi';

import { Menu, Button, Portal } from '@chakra-ui/react';
import { MENU_ITEM } from 'src/frontend/NavBar/buttonStyle.ts';

import "./schedules.css";
import PageHeader from "../PageHeader";
import Schedule from "src/backend/Schedule.ts";
import { ROUTE_NAMES } from "src/backend/RouteNames.ts";

const CAMPUS_ROUTES = ["120", "121", "122", "123", "124", "125", "126"];
const METRO_ROUTES = ["902", "901", "925", "2", "3"];

// Campus routes missing from Metro Transit's schedule data, copied from bus.umn.edu (update each semester)
const CAMPUS_ONLY: Record<string, { days: string, hours: string, every: string, stops: string[], asOf: string }> = {
    "126": {
        days: "Monday–Friday",
        hours: "7:10 AM to 4:50 PM",
        every: "10 minutes",
        stops: ["Jones-Eddy Circle", "Cleveland & Como (northbound)", "St. Paul Student Center", "Cleveland & Como (southbound)", "Jones-Eddy Circle"],
        asOf: "Fall 2026, Sep 8 – Dec 18",
    },
};

const DAY_LABELS ={ Weekday: "Monday–Friday", Saturday: "Saturday", Sunday: "Sunday" };

const DIRECTIONS = { NB: "Northbound", SB: "Southbound", EB: "Eastbound", WB: "Westbound" };

interface DirectionSchedule {
    direction: string;
    headsign: string;
    trips: number;
    spans: [number, number, number | null][];
}

/** Seconds after midnight (can pass 24:00) to "7:40 AM" */
function clock(seconds: number) : string {
    const minutes = Math.round(seconds / 60) % (24 * 60);
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * When each route runs and how often, built weekly from Metro Transit's schedule data
 */
export default function Schedules({ hidden, setPage, initialRouteId }: { hidden: boolean, setPage: any, initialRouteId?: string }) {
    const [routeId, setRouteId] = useState(initialRouteId ?? "121");
    const [schedule, setSchedule] = useState<Record<string, DirectionSchedule[]> | null | undefined>(undefined);

    const name = ROUTE_NAMES[routeId] ?? routeId;

    useEffect(() => {
        // Lets a stop popup on the map pick which route to show
        const open = (event: Event) => setRouteId((event as CustomEvent).detail);
        document.addEventListener("gxm:open-schedule", open);
        return () => document.removeEventListener("gxm:open-schedule", open);
    }, [])

    useEffect(() => {
        setSchedule(undefined);
        Schedule.getTimetable(routeId).then(setSchedule);
    }, [routeId])

    const option = (id: string) => (
        <Menu.RadioItem {...MENU_ITEM} ps="9" key={id} value={id}>
            {ROUTE_NAMES[id]}
            <Menu.ItemIndicator />
        </Menu.RadioItem>
    );
    const group = (title: string, routes: string[]) => (
        <Menu.ItemGroup>
            <Menu.ItemGroupLabel fontSize="sm" fontWeight="bold" px="4">{title}</Menu.ItemGroupLabel>
            <Menu.RadioItemGroup value={routeId} onValueChange={e => setRouteId(e.value)}>
                {routes.map(option)}
            </Menu.RadioItemGroup>
        </Menu.ItemGroup>
    );

    return (
        <div hidden={hidden} className="schedules-page-wrap">
            <PageHeader title="Schedules" setPage={setPage}/>
            <div className="schedules-page">
            <div className="schedules-controls">
                <Menu.Root>
                    <Menu.Trigger asChild>
                        <Button bg="#EDF2F7" color="#1A202C" fontWeight="semibold" fontSize="md" _hover={{ bg: "#E2E8F0" }} _expanded={{ bg: "#CBD5E0" }}>
                            {name} <FiChevronDown />
                        </Button>
                    </Menu.Trigger>
                    <Portal>
                        <Menu.Positioner>
                            <Menu.Content maxHeight="70vh" overflowY="auto" zIndex={2000}>
                                {group("Campus Buses", CAMPUS_ROUTES)}
                                <Menu.Separator />
                                {group("Metro Transit", METRO_ROUTES)}
                            </Menu.Content>
                        </Menu.Positioner>
                    </Portal>
                </Menu.Root>
            </div>

            <h2 className="schedules-title">{name}</h2>

            {schedule === undefined && <p className="schedules-note">Loading…</p>}

            {schedule === null && CAMPUS_ONLY[routeId] && (
                <section className="schedule-day">
                    <h2>{CAMPUS_ONLY[routeId].days}</h2>
                    <p className="schedules-note">
                        {CAMPUS_ONLY[routeId].hours}, every {CAMPUS_ONLY[routeId].every}. No departure timetable is published; buses run on a fixed interval.
                    </p>
                    <h3>Stops</h3>
                    <ol className="campus-stops">{CAMPUS_ONLY[routeId].stops.map((stop, i) => <li key={i}>{stop}</li>)}</ol>
                    <p className="schedules-note">
                        From the University's <a href={`https://bus.umn.edu/${routeId}`} target="_blank" rel="noreferrer">route {routeId} page</a> ({CAMPUS_ONLY[routeId].asOf}). Check there for changes.
                    </p>
                </section>
            )}

            {schedule === null && !CAMPUS_ONLY[routeId] && (
                <p className="schedules-note">
                    Metro Transit doesn't publish a schedule for this route. See the{" "}
                    <a href={`https://bus.umn.edu/${routeId}`} target="_blank" rel="noreferrer">University's route page</a>{" "}
                    or the <a href="https://umn.rider.peaktransit.com" target="_blank" rel="noreferrer">campus rider site</a>.
                </p>
            )}

            {schedule && (["Weekday", "Saturday", "Sunday"] as const).map(day => (
                <section key={day} className="schedule-day">
                    <h2>{DAY_LABELS[day]}</h2>
                    {!schedule[day] ? <p className="schedules-note">No service</p> : schedule[day].map(direction => (
                        <div key={direction.direction} className="schedule-direction">
                            <h3>{DIRECTIONS[direction.direction] ?? direction.direction} <span>to {direction.headsign}</span></h3>
                            <table>
                                <tbody>
                                    {direction.spans.map(([from, to, every], i) => (
                                        <tr key={i}>
                                            <td>{from === to ? clock(from) : `${clock(from)} – ${clock(to)}`}</td>
                                            <td>{every ? `every ${every} min` : "one trip"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </section>
            ))}

            {schedule && (
                <p className="schedules-note">
                    Times are when trips leave the first stop, taken from Metro Transit's published schedule
                    and refreshed weekly. Late-night service can differ on Thursday and Friday.
                </p>
            )}
            </div>
        </div>
    )
}
