import { useEffect, useState } from "react";
import Predictions from "src/backend/Predictions.ts";
import Peak from "src/backend/Peak";
import RouteURL from "src/backend/URL";

// Dots only go on Metro Transit vehicles, so the legend is noise while only campus routes are shown
const hasMetroRoute = () => [...RouteURL.getRoutes()].some(id => !(id in Peak.UNIVERSITY_ROUTES));

/**
 * Toggle and legend for the predicted-late dots on buses, drawn from past runs of each trip
 */
export default function PredictionLegend() {
    const [shown, setShown] = useState(Predictions.isShown());
    const [metro, setMetro] = useState(hasMetroRoute);
    useEffect(() => RouteURL.addListener(() => setMetro(hasMetroRoute())), []);
    const toggle = () => {
        Predictions.setShown(!shown);
        setShown(!shown);
    };

    if (!metro) return null;
    return (
        <div className="prediction-legend">
            <label>
                <input type="checkbox" checked={shown} onChange={toggle}/>
                <strong>Predicted late</strong>
            </label>
            {shown && <ul>
                <li><span className="legend-dot predict-on-time"/>Usually on time</li>
                <li><span className="legend-dot predict-late"/>Often 5+ min late</li>
                <li className="muted">No dot: not enough past runs</li>
            </ul>}
        </div>
    );
}
