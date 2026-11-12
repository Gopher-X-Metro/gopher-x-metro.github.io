import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";

// Offline support: the app shell, schedules and stop list are kept on the device, so the site opens
// instantly on repeat visits and still opens with no signal (live times need a connection)
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ChakraProvider value={defaultSystem}>
      <App />
  </ChakraProvider>
);
