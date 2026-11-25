// Top bar: compress toggle, wordmark, tagline, nav, help menu, theme toggle, account menu (PRD §17).
import { FileText, Info, Moon, PanelLeft, Shield, Sun, Zap } from "lucide-react";
import type { User } from "../App";
import { setTourOn, startTour, tourOn } from "../help";
import { Menu, Wordmark } from "./ui";

type Props = {
  page: string;
  user: User | null;
  theme: string;
  onTheme: () => void;
  onMini?: () => void;
  onOut: () => void;
};

export default function Topbar({ page, user, theme, onTheme, onMini, onOut }: Props) {
  const signedIn = user && !["login", "register"].includes(page);
  return (
    <header className="top">
      {onMini && (
        <button
          type="button"
          className="ib"
          onClick={onMini}
          aria-label="Compress or expand side panels"
          data-tour="mini"
        >
          <PanelLeft />
        </button>
      )}
      <Wordmark />
      <span className="tag">An Agentic SDLC Ranker for Sustainable AI Infrastructure</span>
      {signedIn && (
        <nav className="nav">
          <a href="#/projects" className={["projects", "p", "new"].includes(page) ? "on" : ""}>
            Projects
          </a>
          <a href="#/eval" className={page === "eval" ? "on" : ""}>
            Evaluation
          </a>
          <a href="#/about" className={page === "about" ? "on" : ""}>
            About
          </a>
        </nav>
      )}
      <div className="tright">
        <Menu label="Help" button={<Info />} tour="help">
          <button type="button" onClick={startTour}>
            <Zap />
            Replay tour
          </button>
          <button type="button" onClick={() => setTourOn(!tourOn())}>
            <Info />
            Tour on first visit
            <small>{tourOn() ? "on" : "off"}</small>
          </button>
          <hr />
          <a href="#/terms">
            <FileText />
            Terms and sources
          </a>
          <a href="#/privacy">
            <Shield />
            Privacy
          </a>
        </Menu>
        <button type="button" className="ib" onClick={onTheme} aria-label="Toggle theme" data-tour="theme">
          {theme === "dark" ? <Moon /> : <Sun />}
          {theme === "dark" ? "Dark" : "Light"}
        </button>
        {signedIn && (
          <Menu label="Account" className="me" button={user.name.slice(0, 2).toUpperCase()}>
            <button type="button" disabled>
              {user.email}
            </button>
            <hr />
            <button type="button" onClick={onOut}>
              Sign out
            </button>
          </Menu>
        )}
      </div>
    </header>
  );
}
