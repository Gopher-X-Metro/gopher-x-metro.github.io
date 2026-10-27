import React, { useEffect, useState } from 'react';
import RouteButton from './RouteButton.tsx';
import { Icon } from '@chakra-ui/react';
import { GiHamburgerMenu } from 'react-icons/gi';
import RouteURL from 'src/backend/URL.ts';
import SearchFeature from 'src/frontend/NavBar/components/SearchFeature.tsx';
import Schedule from 'src/backend/Schedule.ts';
import Realtime from 'src/backend/Realtime.ts';
import Peak from 'src/backend/Peak.ts';

/** Saturdays during the Gopher football season, roughly late August to early December */
function isGameDaySaturday() : boolean {
    const today = new Date();
    const start = new Date(today.getFullYear(), 7, 24), end = new Date(today.getFullYear(), 11, 7);
    return today.getDay() === 6 && today >= start && today <= end;
}

export default function SideBar() {
    const [_, forceReload] = useState(0);
    const [routes, setRoutes] = useState(new Map<string, string>());
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [footballDay, setFootballDay] = useState(isGameDaySaturday());

    useEffect(() => {
        // The football shuttle only runs on game days; also show it whenever its buses are out
        Realtime.getRealtimeGTFSUniversity().then(data => {
            if (data?.vehicles?.some((v: any) => v.routeID === Peak.UNIVERSITY_ROUTES["FOOTBALL"] && !v.hidden)) setFootballDay(true);
        });
    }, [])

    routes.set("120", "120 East Bank Circulator");
    routes.set("121", "121 Campus Connector");
    routes.set("122", "122 University Ave Circulator");
    routes.set("123", "123 4th Street Circulator");
    routes.set("124", "124 St. Paul Circulator");
    routes.set("125", "125 Dinkytown Connector");
    routes.set("126", "126 Campus Express");
    if (footballDay) routes.set("FOOTBALL", "Football Game Day Shuttle");
    routes.set("902", "Green Line");
    routes.set("901", "Blue Line");
    routes.set("925", "E Line");
    routes.set("2", "2 Franklin Av");
    routes.set("3", "3 Como Av / Downtown");

    useEffect(() => {
        // On phones the open sidebar covers most of the map, so tapping outside it closes it
        if (!sidebarOpen || !window.matchMedia("(max-width: 640px)").matches) return;
        const close = (event: PointerEvent) => {
            const target = event.target as Element;
            if (!target.closest(".sidebar, .openbtn")) setSidebarOpen(false);
        };
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [sidebarOpen])

    useEffect(() => {
        // Allows the user to hit "Enter" to enter a route
        const searchBox = document.getElementById("search_route");
        const onEnter = (event: KeyboardEvent) => event.code === "Enter" ? SearchFeature.searchRoute() : null;
        searchBox?.addEventListener("keydown", onEnter);

        /**
         * Convert a string to a properly cased title
         * @param input input string
         */
        const toTitleCase = (input : string) => { 
            return input.replace( 
                /\w\S*/g, 
                text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase() 
            ); 
        }

        /**
         * Updates the displayed routes on the sidebar
         */ 
        const change = async () => {
            // Extra routes from the link or the route box; only real ones are listed
            for (const routeId of RouteURL.getRoutes()) {
                if (!routes.has(routeId)) {
                    const info = await Schedule.getRoute(routeId);
                    if (info) routes.set(routeId, toTitleCase(info.route_label));
                }
            }

            setRoutes(new Map(routes));  // new reference, or React bails out of the update
            forceReload(Math.random());
        }

        RouteURL.addListener(() => change());

        change();

        return () => searchBox?.removeEventListener("keydown", onEnter);
    }, [])

    return (
        <>
            <div id="navbar-toggle">
                <button className="openbtn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    <Icon as={GiHamburgerMenu} boxSize={6} />
                </button>
            </div>

            <div id="nav-bar" className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
                {[["Campus buses", true], ["Metro Transit", false]].map(([title, campus]) => (
                    <React.Fragment key={title as string}>
                        <h3 className="sidebar-heading">{title}</h3>
                        <div className='sidebar-content'>
                            {Array.from(routes.keys())
                                .filter(routeId => !!Peak.UNIVERSITY_ROUTES[routeId as string] === campus)
                                .map(routeId => (<React.Fragment key={routeId as string}><RouteButton routeId={routeId as string} text={routes.get(routeId)}/></React.Fragment>))}
                        </div>
                    </React.Fragment>
                ))}

                <h3 className="sidebar-heading">Add a route</h3>
                
                <div className="route-search">
                    <input type="text" id="search_route" placeholder="Route number, like 61" inputMode="numeric" aria-label="Route number"/>
                    <button onClick={SearchFeature.searchRoute} id="searchButton">Add</button>
                </div>
                
                <div className= "error_text" id = 'error_text'></div>
            </div>
        </>
    )
    
}
