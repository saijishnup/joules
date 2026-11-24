// Export: scaled preview of the one-page report, Save as PDF (browser print, no PDF library) and JSON download.
import { Download, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Ctx } from "../pages/Workspace";
import Report from "./Report";

type Source = { title: string; licence: string };

export default function Export({ ctx }: { ctx: Ctx }) {
  const { p } = ctx;
  const [lic, setLic] = useState<Record<string, string>>({});
  useEffect(() => {
    api<Source[]>("/sources").then(
      (s) => setLic(Object.fromEntries(s.map((x) => [x.title, x.licence]))),
      () => {},
    );
  }, []);
  useEffect(() => {
    // PRD §19: on print, copy the fitted preview into a body-level node; print CSS shows only that node.
    const root = document.getElementById("printroot") as HTMLElement;
    const copy = () => {
      root.innerHTML = document.querySelector(".exp .paper")?.outerHTML ?? "";
    };
    addEventListener("beforeprint", copy);
    return () => {
      removeEventListener("beforeprint", copy);
      root.innerHTML = "";
    };
  }, []);
  const ok = p.gates["1"] && p.gates["2"];
  const json = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }));
    a.download = `joules-${p.id}.json`;
    a.click();
  };
  return (
    <>
      <div className="who rise">
        <div>
          <h2>Export</h2>
          <p>
            {ok
              ? "Both gates passed. The report is final."
              : "Draft until both gates pass; the watermark and the red badge go away after gate 2."}
          </p>
        </div>
      </div>
      <div className="exp rise">
        <div className="paper">
          <Report key={p.updated_at} p={p} licences={lic} />
        </div>
        <div className="acts" style={{ display: "grid", gap: 10, position: "sticky", top: 0 }}>
          <button type="button" className="b pri" onClick={() => print()}>
            <Printer />
            Save as PDF
          </button>
          <button type="button" className="b" onClick={json}>
            <Download />
            Download JSON
          </button>
          <p className="muted" style={{ fontSize: 12 }}>
            One A4 page. No PDF library: only the report prints; pick "Save as PDF" in the print dialog.
          </p>
        </div>
      </div>
    </>
  );
}
