import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./styles/tokens.css";
import "./styles/app.css";
import App from "./App.jsx";
import { AuthProvider, ThemeProvider, ToastProvider } from "./context/AppContext";
import { HotelProvider } from "./context/HotelContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <HotelProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </HotelProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
