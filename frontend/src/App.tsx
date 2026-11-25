// App shell: hash router, signed-in user, theme, top bar. Pages own their state; navigation is the only page-wide animation.
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import Topbar from "./components/Topbar";
import About from "./pages/About";
import Auth from "./pages/Auth";
import Evaluation from "./pages/Evaluation";
import { Privacy, Terms } from "./pages/Legal";
import Projects from "./pages/Projects";
import Workspace from "./pages/Workspace";

export type User = { id: number; email: string; name: string };
const useHash = () => {
  const [h, setH] = useState(location.hash.slice(2));
  useEffect(() => {
    const on = () => setH(location.hash.slice(2));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return h;
};

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [theme, setTheme] = useState(localStorage.getItem("joules-theme") || "dark");
  const [mini, setMini] = useState(false);
  const hash = useHash();
  const [page, a, b] = (hash || "projects").split("/");

  useEffect(() => {
    api<User>("/me").then(setUser, () => setUser(null));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("joules-theme", theme);
  }, [theme]);
  const signOut = useCallback(async () => {
    await api("/auth/logout", "POST");
    setUser(null);
    location.hash = "#/login";
  }, []);

  if (user === undefined) return null;
  const open = ["login", "register", "about", "terms", "privacy"].includes(page);
  if (!user && !open) {
    location.hash = "#/login";
    return null;
  }
  const view =
    page === "login" || page === "register" ? (
      <Auth
        mode={page}
        onIn={(u) => {
          setUser(u);
          location.hash = "#/projects";
        }}
      />
    ) : page === "p" || page === "new" ? (
      <Workspace key={a || "new"} id={page === "new" ? null : Number(a)} stage={Number(b) || 0} mini={mini} />
    ) : page === "eval" ? (
      <Evaluation />
    ) : page === "about" ? (
      <About />
    ) : page === "terms" ? (
      <Terms />
    ) : page === "privacy" ? (
      <Privacy />
    ) : (
      <Projects />
    );
  return (
    <div id="app">
      <Topbar
        page={page}
        user={user}
        theme={theme}
        onTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onMini={page === "p" ? () => setMini(!mini) : undefined}
        onOut={signOut}
      />
      <main className="view" key={page}>
        {view}
      </main>
    </div>
  );
}
