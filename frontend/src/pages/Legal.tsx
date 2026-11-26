// Terms (use terms + third-party sources table from sources/manifest.csv) and Privacy (PRD §16, M7).
import { useEffect, useState } from "react";
import { api } from "../api";
import { Chip, Footer } from "../components/ui";

type Source = {
  title: string;
  publisher: string;
  licence: string;
  link: string;
  jurisdiction: string;
  effective_date: string;
  public: string;
};

export function Terms() {
  const [rows, setRows] = useState<Source[]>([]);
  useEffect(() => {
    api<Source[]>("/sources").then(setRows, () => {});
  }, []);
  return (
    <div className="page">
      <div className="legal">
        <p className="lbl">Legal</p>
        <h1 className="display">Terms and sources</h1>
        <p>
          Joules is a student project. It drafts requirements and ranks SDLC models; it does not give legal, compliance
          or engineering advice. Every output needs review and sign-off by a qualified person.
        </p>
        <h2>Use</h2>
        <ul>
          <li>Use sample or anonymised briefs only. Do not upload confidential documents.</li>
          <li>Accounts are rate-limited: 40 runs and 300 model calls per hour.</li>
          <li>The code is licensed AGPL-3.0, because PyMuPDF is AGPL-3.0.</li>
        </ul>
        <h2>Third-party sources and licences</h2>
        <p>
          Quotes are short and attributed. Sources marked "local only" are never shipped in the public index or the
          repository; the public index holds only redistributable sources.
        </p>
      </div>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Publisher</th>
              <th>Licence or notice</th>
              <th>Jurisdiction</th>
              <th>Date</th>
              <th>Public index</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.title}>
                <td>
                  {s.link ? (
                    <a href={s.link} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                </td>
                <td>{s.publisher}</td>
                <td className="muted">{s.licence}</td>
                <td>{s.jurisdiction}</td>
                <td className="mono">{s.effective_date}</td>
                <td>{s.public === "yes" ? <Chip t="yes" v="--hi" /> : <Chip t="local only" v="--med" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Generated from sources/manifest.csv. Names of standards bodies are used to cite, not to imply endorsement.
      </p>
      <Footer />
    </div>
  );
}

export function Privacy() {
  return (
    <div className="page">
      <div className="legal">
        <p className="lbl">Legal</p>
        <h1 className="display">Privacy</h1>
        <h2>What we store</h2>
        <ul>
          <li>Your email, a scrypt password hash and a session token.</li>
          <li>Projects: masked brief, masked answers, requirements, approvals and an audit log of every model call.</li>
        </ul>
        <h2>Masking</h2>
        <p>
          Before any text leaves the server, regex rules replace emails, Indian phone numbers, Aadhaar, PAN, GSTIN, card
          numbers, IP addresses and API-key shapes with tags such as [EMAIL]. Only the masked text is stored.
        </p>
        <h2>Third-party model providers</h2>
        <p>
          Masked text and retrieved source passages are sent to third-party LLM APIs (Groq, Google Gemini) through a
          local gateway, or to a local Ollama model. Those providers process it under their own terms. Masking is
          pattern-based and can miss things, so do not enter real personal data.
        </p>
        <h2>Retention and deletion</h2>
        <p>
          Deleting a project hard-deletes its requirements, conflicts, approvals and audit rows. No analytics or
          tracking cookies.
        </p>
        <h2>Your rights</h2>
        <p>
          Written with India's DPDP Act 2023 in mind: you can see, correct and erase your project data from the app.
        </p>
      </div>
      <Footer />
    </div>
  );
}
