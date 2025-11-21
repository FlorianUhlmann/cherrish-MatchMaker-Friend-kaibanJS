# AI Matchmaker Agent Definitions (AGENTS.md)

## 🎯 Meta-Kontext: Deine Rolle als Assistent (Codex)

Dieses Dokument beschreibt primär die fachliche und technische Spezifikation der KI-Agenten *innerhalb der Matchmaker-App*.

Deine übergeordnete Rolle, Codex, ist es jedoch, als **hilfsbereiter Mentor** für den Entwickler zu agieren, der dieses Projekt auf Basis von Next.js, React und KaibanJS aufbaut.

**Wichtiger Benutzerkontext:**

- **Benutzer-Persona:** Du unterstützt einen **Senior-Entwickler**, der jedoch **neu im Bereich Next.js und React** ist.
- **Lernziele:** Das Hauptziel des Benutzers ist es, Next.js („Next Jazz“) und React („Rec“) von Grund auf zu lernen und dabei eine echte, sinnvolle Anwendung (AI Matchmaker) zu bauen.
- **Entwicklungsumgebung:** Der Entwickler verwendet **Node.js v20** („No. 20“) auf seinem Rechner. Alle Ratschläge, Code-Beispiele und Fehlerbehebungen müssen mit dieser Version kompatibel sein.

**Deine Kernaufgaben als "Helfer":**

1. **Systemverständnis:** Hilf dem Benutzer, das System (Next.js + KaibanJS + Vektordatenbank) und die Architektur der Matchmaker-App zu verstehen.
2. **Tutorial-Führung:** Führe den Benutzer schrittweise durch die Implementierung (Komponenten, Routen, Agenten-Setup, Tools) und erkläre immer auch *warum* bestimmte Schritte unternommen werden.
3. **Proaktive Problemlösung:** Unterstütze bei Fragen zu React-Hooks, Next.js-Routing, KaibanJS-Teams, Pinecone-Integration und RAG-Pattern mit klaren, Node.js-20-kompatiblen Beispielen.

---

## 💡 Produktvision: AI Matchmaker

**Business-Ziel (in einem Satz):**  
Eine **AI Matchmaker**-App hilft Nutzern dabei, schneller passende, potenzielle Partner zu finden.

**Kurzbeschreibung der User Journey:**

- Der User führt zunächst ein Gespräch mit einem **Matchmaker-Agenten**, der versteht, was der User sucht (Werte, Wünsche, Grenzen, Motivation, psychologisches Profil).
- Auf Basis dieses Profils durchsucht ein **Matching-Agent** eine **Vektordatenbank** mit anderen Profilen und schlägt ein passendes Match vor – in einem menschlich klingenden, an den User angepassten Tonfall.
- Der User kann das Match **akzeptieren** („passt zu mir“) oder **ablehnen** („zeige mir jemand anderen“).
- Bei Ablehnung wird ein **weiteres Match** vorgeschlagen. Der Prozess ist in der ersten Version bewusst **sequenziell** gehalten und kann später um komplexere Feedback-Schleifen erweitert werden.

---

## 🏗️ Technische Architektur (High Level)

- **Frontend / App-Framework:** Next.js + React (Node.js v20).
- **Agenten-Orchestrierung:** KaibanJS (Agenten, Tasks, Teams).
- **Vektordatenbank:** Pinecone (über KaibanJS-Tool), genutzt für:
  - Speichern von Nutzerprofilen als **Feature-Vektoren / Embeddings**.
  - Ähnlichkeitssuche, um passende Profile zu finden.
- **RAG-Nutzung:**
  - Der Matching-Agent nutzt RAG, um aus Vektor-Treffern und Profilinformationen eine gut lesbare, menschliche Beschreibung des vorgeschlagenen Matches zu erzeugen.

Details wie konkrete Dateipfade (z. B. `app/matchTeam.ts`) und Tool-Namen können sich im Verlauf des Projekts noch ändern und werden iterativ konkretisiert.

---

## 🤖 Agenten-Rollen

In der ersten Ausbaustufe sind zwei Hauptagenten geplant. Beide Rollen sind bewusst **generisch formuliert**, damit die konkrete Implementierung sich im Projektverlauf entwickeln kann.

### 1. Matchmaker & Coach Agent (Gespräch mit dem User)

- **Name (konzeptionell):** „Matchmaker Agent“
- **Rolle:**
  - Führt ein dialogorientiertes, psychologisch angehauchtes Gespräch mit dem User.
  - Fragt nach Wünschen, Bedürfnissen, Grenzen, Werten und Motivation in Bezug auf eine Partnerschaft.
- **Ziel:**
  - Ein psychologisches/semantisches **Suchprofil des Wunschpartners** des Users erstellen.
  - Dieses Suchprofil wird als Grundlage für die RAG-Suche in der Vektordatenbank verwendet.
- **Verhalten / Tonfall:**
  - Coaching-/Gesprächs-Charakter, empathisch und mit Humor.
  - Passt sich an den User an:
    - Wenn der User kurz antwortet, bleibt der Agent eher knapp.
    - Wenn der User ausführlich wird, darf der Agent auch tiefer gehen.
- **Technische Aufgaben:**
  - Generiert ein strukturiertes Suchprofil (z. B. JSON-artige Daten, die später in Embeddings überführt werden können).
  - Übergibt dieses Profil an ein Tool, das es als **Feature-Vektor** für die Suche in der Vektordatenbank aufbereitet.
- **Tools (konzeptionell):**
  - `searchProfileVectorTool` – bereitet das Suchprofil als Vektor auf und stellt es für die Match-Suche zur Verfügung.

### 2. Matching & Recommendation Agent (Vorschläge aus der Vektordatenbank)

- **Name (konzeptionell):** „Matching Agent“
- **Rolle:**
  - Sucht passende potenzielle Partnerprofile in der Vektordatenbank.
  - Bereitet den ausgewählten Vorschlag in einer Art „Vorstellung“ für den User auf.
- **Ziel:**
  - Einen **Match** finden, der möglichst gut zum durch den Matchmaker Agenten erstellten Suchprofil passt.
  - Den Match so erklären, dass der User eine schnelle Entscheidung treffen kann („passt / passt nicht“).
- **Verhalten / Tonfall:**
  - Stellt Matches kurz und verständlich vor.
  - Erklärt nur knapp, warum der Kandidat passt, z. B.:
    - „Ihr teilt Eigenschaften A, B, C – deshalb könnte diese Person gut zu dir passen.“
- **Technische Aufgaben:**
  - Führt eine **Ähnlichkeitssuche** in der Vektordatenbank aus, basierend auf dem Suchprofil des Users.
  - Nutzt RAG, um aus Vektor-Treffern eine konsistente, natürliche Textbeschreibung zu generieren.
  - Reagiert auf Feedback des Users:
    - Bei „passt nicht“ sucht er einen weiteren Kandidaten und stellt ihn vor.
    - Bei „passt“ kann er optional nächste Schritte einleiten (z. B. „Match akzeptiert“-Status).
- **Tools (konzeptionell):**
  - `matchSearchTool` – führt eine Vektor-Suche gegen Pinecone aus.
  - Optional: `matchDetailFetchTool` – um zusätzliche Profildetails/Metadaten zu laden.

---

## 🔄 Ablauf: Sequenzieller Flow (erste Version)

1. **User startet den Chat** mit dem Matchmaker Agent.
2. **Matchmaker Agent** stellt Fragen und erstellt ein **Suchprofil für einen potenziellen Partner** (Wünsche, psychologische und inhaltliche Merkmale, in Feature-Vektoren überführbar).
3. Dem User wird eine **Zusammenfassung des Suchprofils** gezeigt. Nach Bestätigung wird die eigentliche Suche gestartet.
4. Das Suchprofil wird über ein Tool in eine **Vektor-Repräsentation** überführt und für die Abfrage der Vektordatenbank genutzt.
5. Der **Matching Agent** fragt auf Basis dieses Suchprofils die Vektordatenbank ab und findet einen passenden Kandidaten.
6. Der Matching Agent stellt den Kandidaten kurz vor und erklärt grob, warum dieser passen könnte.
7. Der User entscheidet:
   - **Ja:** Match wird akzeptiert (Status kann gespeichert werden).
   - **Nein:** Matching Agent sucht einen weiteren Kandidaten und stellt diesen vor.

Dieser Flow ist bewusst **einfach und sequenziell** gehalten und kann später um komplexere Feedback- und Lernmechanismen erweitert werden.

---

## 🧱 Vektordatenbank & Profile (abstrakt)

- Es wird eine **Vektordatenbank** (z. B. Pinecone) genutzt.
- Gespeicherte bzw. abgefragte Inhalte:
  - Psychologische und inhaltliche Merkmale, die das Suchprofil des Users beschreiben, in Form von Feature-Vektoren / Embeddings.
  - Profile potenzieller Partner, ebenfalls als Vektoren in derselben Datenbank.
- In dieser Phase des Projekts ist bewusst **nicht festgelegt**, welches konkrete Schema die Profile haben.
  - In `AGENTS.md` wird nur festgehalten, dass mit **Feature-Vektoren / Embeddings** gearbeitet wird.
  - Die konkrete Struktur entsteht im Verlauf der Implementierung.

---

## 🧭 Status & Offenheit für Änderungen

- Diese `AGENTS.md` beschreibt die **erste Version** der Agentenlandschaft und des Flows für den AI Matchmaker.
- Agenten-Namen, Tonalität, konkrete Tool-Namen und Dateipfade sind **noch nicht final** und können im Projektverlauf angepasst werden.
- Wichtig ist, dass folgende Punkte klar bleiben:
  - Business-Ziel: AI Matchmaker für schnellere, passendere Partnerfindung.
  - Zwei Hauptagenten:
    - Matchmaker/Coach (Profil- und Suchprofil-Aufbau).
    - Matching/Recommendation (Vektorsuche + Vorstellung der Matches).
  - Nutzung einer Vektordatenbank mit Feature-Vektoren/Embeddings (z. B. Pinecone + KaibanJS-Tooling).

#### more MD files


##updates LOG

Core Updates

  - app/matchTeam.ts:1 now defines the full KaibanJS roster (best-friend interviewer, summary
    strategist, matcher, feedback coach, psychology narrator) plus reusable task runners with
    zod-validated JSON schemas and safe env plumbing, so /api/generate can request individual
    reasoning steps while still benefitting from Kaiban tooling.
  - app/api/generate/route.ts:1 replaces the topic-based blog endpoint with an in-memory session
    store + phase machine (collecting → summarizing → awaiting_confirmation → matching → feedback
    → ended), Whisper transcription handling (multipart upload support for Chrome voice notes),
    Pinecone embedding/query helpers, summary/match confirmation loops, feedback logging, and
    psychology profile export that the UI can stash in sessionStorage.
  - app/page.tsx:1 rebuilds the landing page into a React client component with dropdown-
    configured dealbreakers, a full chat transcript, text input + MediaRecorder-driven mic/timer
    (2-minute cap), summary confirmation card, match card, feedback form, soft-cap banner, and
    exit control that calls the new backend actions and mirrors their state transitions.
  - app/profile-summary/page.tsx:1 introduces the exit page that pulls the stored psychology
    profile from sessionStorage, surfaces strengths/growth areas/experiment, and lets the user
    jump back into the chat if no profile is available.
  - app/globals.css:1 rewrites styling for the chat/match layout (two-column card layout, bubbles,
    controls, banners, cards, exit CTA), while README.md:1 and package.json:1 document/install
    the new dependencies (openai, @pinecone-database/pinecone, zod) plus the required OpenAI +
    Pinecone env vars so Vercel deploys can be configured correctly.