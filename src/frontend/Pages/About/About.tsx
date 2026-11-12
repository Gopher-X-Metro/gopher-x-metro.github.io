import React from "react";

import PageHeader from "../PageHeader";
import "../Schedule/schedules.css";

const FEEDBACK_URL = "https://github.com/Gopher-X-Metro/gopher-x-metro.github.io/issues";

const FAQ: [string, React.ReactNode][] = [
    ["What can I track?",
        "Every campus bus (routes 120–126, plus the football shuttle on game days), and any Metro Transit bus or light rail line. Campus bus locations refresh every couple of seconds and Metro every few seconds. Buses whose location hasn't updated in over two minutes are faded out."],
    ["How do I add a route that isn't in the menu?",
        "Open the route menu (☰) and type the route number into \"Add a route\" at the bottom."],
    ["How do I find stops near me?",
        "Tap \"Stops near me\" for the closest stops, when the next buses leave, and how long the walk is. Tap the star on a stop to keep it at the top of that list, or the bell next to a departure to get a notification 5 minutes before it leaves."],
    ["What does tapping a bus show?",
        "Its route, direction, next stop and when it gets there, whether it's running late, and its bus number. Campus buses also show how full they are."],
    ["How does place search work?",
        "Search for a building or address to drop a pin there and show the stops around it. Tap any stop for its upcoming departures."],
    ["Can I put it on my home screen?",
        "Yes. In Safari tap Share → Add to Home Screen, or in Chrome tap ⋮ → Add to Home screen. It opens like an app."],
];

function About({ hidden, setPage }) {
    return (
        <div hidden={hidden} className="schedules-page-wrap">
            <PageHeader title="About" setPage={setPage}/>
            <div className="schedules-page">
                <p className="about-lead">
                    Gopher X Metro shows University of Minnesota campus buses and Metro Transit buses and trains on one live map.
                    The campus buses are free, and students who pay the Transportation and Safety Fee get
                    a <a href="https://pts.umn.edu/transit/passes/universal-student-transit-pass" target="_blank" rel="noreferrer">Universal Transit Pass</a> on
                    their U Card for Metro Transit and several suburban providers.
                </p>

                <h2 className="alerts-heading">Questions</h2>
                <dl className="faq">
                    {FAQ.map(([question, answer]) => (
                        <div key={question}>
                            <dt>{question}</dt>
                            <dd>{answer}</dd>
                        </div>
                    ))}
                </dl>

                <h2 className="alerts-heading">Other maps</h2>
                <ul className="about-text about-links">
                    <li><a href="https://campusmaps.umn.edu/" target="_blank" rel="noreferrer">UMN Campus Bus Map</a>: official campus maps, buildings and bus routes</li>
                    <li><a href="https://umn.rider.peaktransit.com" target="_blank" rel="noreferrer">GopherTrip Map</a>: the University's own live campus bus tracker</li>
                </ul>

                <h2 className="alerts-heading">Feedback</h2>
                <p className="about-text">
                    Found a bug or want a feature? <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">Open an issue on GitHub</a>.
                </p>

                <h2 className="alerts-heading">Disclaimer</h2>
                <p className="about-text">
                    Gopher X Metro is an independent, student-built project. It is not affiliated with, endorsed by,
                    or sponsored by the University of Minnesota, Metro Transit, the Metropolitan Council, or Peak Transit.
                    "Gophers," "Metro Transit" and other names and marks belong to their respective owners and are used
                    here only to describe the services shown.
                </p>
                <p className="about-text">
                    Arrival times, bus locations, routes, alerts and schedules come from third-party feeds and are
                    provided "as is," without warranty of any kind. They can be late, missing or wrong. Please confirm
                    with <a href="https://www.metrotransit.org" target="_blank" rel="noreferrer">Metro Transit</a> or{" "}
                    <a href="https://bus.umn.edu/" target="_blank" rel="noreferrer">UMN Parking &amp; Transportation</a>{" "}
                    before relying on it. The authors aren't responsible for missed buses, delays or any other loss
                    from using this site. Departure alerts only work while this page stays open and aren't guaranteed.
                    Don't use the site while driving. In an emergency, call 911.
                </p>
                <p className="about-text">
                    Privacy: there are no accounts and no tracking. Your location is used in your browser to find
                    nearby stops and isn't stored by us. Favorites stay on your device. Place searches are sent
                    to <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> to find addresses.
                    The code is open source under the MIT License.
                </p>

                <h2 className="alerts-heading">Credits</h2>
                <p className="about-text">
                    Built in 2024 by Adam, Ken (<a href="https://kennedyjohnson.github.io/" target="_blank" rel="noreferrer">portfolio</a>), Riley, Will, Babacar, Alex, Mike, Andy and Avi, and revived in 2026.
                    Live data from Metro Transit and Peak Transit. Map data © OpenStreetMap contributors.
                </p>
            </div>
        </div>
    );
}

export default About;
