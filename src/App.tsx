import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
const Home = lazy(() => import("./Home"));
const Game = lazy(() => import("./Game"));
const Rules = lazy(() => import("./Rules"));
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Hexfront home">
      <span className="brand-mark">H</span>
      <span>
        HEXFRONT<small>COMMAND THE FRONTIER</small>
      </span>
    </Link>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="loading" role="status">
            Assembling the frontier…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:code" element={<Game />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
