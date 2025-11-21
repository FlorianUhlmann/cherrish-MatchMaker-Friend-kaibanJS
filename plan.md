# Implementation Plan

## Overview
- Replace the existing blog-generator stack with a chat-first “best friend” matchmaker experience that supports 2–4 reflective questions, a neutral summary, Pinecone search, match feedback, and an exit-triggered psychology profile summary.
- Support dropdown-configured dealbreakers (preferred age decade, city, kids wish), voice answers via Whisper (Chrome-compatible, mac + Android/PC formats, 2-minute cap with timer), and automatic transition from summary confirmation into the Pinecone search/match loop.
- Keep everything single-session/in-memory, nudge the user to exit once ~20 total turns are reached, and present the final psychology profile on a dedicated summary page after “Exit Partner Search.”

## Subplan 1 — Backend Orchestration & AI Agents
1. **Define Kaiban team (`app/matchTeam.ts`)**
   - Agents: BestFriend Matchmaker (interview + summary payload), Matcher (Pinecone top-1 rationale), Feedback (probe pros/cons), Psychology (exit summary).
   - Tools/env: OpenAI (chat + Whisper) + Pinecone (env vars `PINECONE_API_KEY`, `PINECONE_ENV`, `PINECONE_INDEX`, `PINECONE_NAMESPACE`).
2. **Redesign `/api/generate/route.ts`**
   - Accept `{ messages, action, dropdowns, audio? }`.
   - Handle Whisper transcription for `audio/webm`+`audio/mp4|m4a|aac`, enforce 2-minute recordings, return transcript appended to chat history.
   - Maintain stateless phase machine: `collecting → summarizing → awaiting_confirmation → matching → feedback → ended`, with summary auto-trigger (after 2–4 agent Qs) and 20-turn soft cap flag.
3. **Summary & payload generation**
   - Ensure BestFriend agent outputs both neutral prose summary and structured search payload (text query plus metadata copy of dropdown values).
   - On `confirm_summary`, persist payload to pass into matcher.
4. **Pinecone match execution**
   - Invoke Kaiban Pinecone tool with payload + metadata filters, limit to top-1, format response to short blurb + concise “why it fits.”
5. **Feedback + exit psychology summary**
   - Expose `submit_feedback` action that logs feedback notes with Feedback agent.
   - On `leave`, trigger Psychology agent to summarize conversation + feedback into a profile string; return it to frontend (and any stats) for the profile-summary page.
6. **Testing hooks**
   - Provide mock inputs for unit testing (optional) and ensure errors (missing env, Whisper failure, Pinecone issues) return descriptive messages to the UI.

## Subplan 2 — Frontend UX, Voice Capture & Navigation
1. **Home/chat page (`app/page.tsx`)**
   - Add dropdown row: Age (20s/30s/40s default/50s/60s/70s), Location (Berlin default/Munich/Hamburg/Cologne), Kids wish (No default/Yes).
   - Replace blog UI with chat transcript + input bar.
2. **Voice-enabled input**
   - Implement `MediaRecorder` for Chrome (macOS generates mp4/aac; Android/PC webm/opus).
   - Show live mm:ss timer up to 2:00, auto-stop at cap, allow manual stop/retry, insert transcript into input for editing; multiple recordings stack as separate user turns.
3. **Phase-driven rendering**
   - While `collecting`, show ongoing chat.
   - When summary available, display neutral summary card with `Confirm` (auto-triggers match) and `Edit` (regenerate) buttons.
   - During `matching`, show spinner/message; then render match card with short rationale only.
   - After match, show feedback prompt UI and send responses to backend.
4. **Exit & profile summary**
   - Provide “Exit Partner Search” button; on click, call `leave`, obtain psychology profile, then navigate to `/profile-summary` with the profile data (via search params or router state).
   - Build `app/profile-summary/page.tsx` to display the profile summary (session only, no persistence).
5. **Soft-cap notice & error handling**
   - Track total turns; after 20, show banner nudging user to exit.
   - Surface loading states and errors for Whisper, summary generation, Pinecone search, feedback submission.
6. **Styling**
   - Update `app/globals.css` or use component styles for chat bubbles, dropdowns, mic button (recording/idle states), timer chip, cards, banners.
7. **Validation**
   - Manual smoke test of full flow (text-only, voice-only, mixed input).
   - Run `npm run lint` and `npm run build` per AGENTS instructions before concluding work.

## Dependencies & Risks
- **External services:** OpenAI (chat + Whisper) and Pinecone must be reachable; add clear env var docs.
- **Audio handling:** Browser audio format quirks (mp4/aac vs webm/opus) need conversion/compatibility testing; limit to Chrome simplifies scope but still test macOS vs Android/PC.
- **State management:** Stateless API relies on client-supplied history—ensure front-end reliably persists messages in memory during session.
- **Performance:** Whisper transcription and Pinecone search add latency; use UI feedback (spinners, disable buttons) to keep UX smooth.
