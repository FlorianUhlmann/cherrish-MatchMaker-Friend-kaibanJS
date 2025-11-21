# AI Matchmaker MVP

This repo hosts a KaibanJS + Next.js demo where a “best-friend” agent interviews the user, summarizes their dream partner, runs a Pinecone similarity search, and walks through a feedback/psychology summary loop. It is built for Node.js 20 and Vercel deployment.

## Features

- Conversational UI with dropdown dealbreakers, soft-cap nudge, and Chrome-compatible voice capture (MediaRecorder → Whisper).
- Stateful `/api/generate` route that manages phases (`collecting → summarizing → awaiting_confirmation → matching → feedback → ended`) and stores session data in-memory.
- KaibanJS agents (`matchTeam.ts`) for interviewing, summarizing, match narration, feedback coaching, and psychology profiling.
- Pinecone top-1 search using OpenAI embeddings plus dropdown filters, with RAG-style copy for the match card.
- Exit page (`/profile-summary`) that surfaces the psychology summary stored in `sessionStorage`.

## Environment Variables

Create `.env.local` (Vercel-compatible) with:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini               # optional, defaults to gpt-4o-mini
OPENAI_WHISPER_MODEL=gpt-4o-mini-transcribe
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
PINECONE_API_KEY=pc-...
PINECONE_INDEX=matchmaker-index
PINECONE_NAMESPACE=profiles            # optional
```

You can also export `TAVILY_API_KEY` or other Kaiban tool keys if you extend the agents.

## Running the app

```bash
npm install
npm run dev     # Next.js dev server
```

The chat experience lives at `http://localhost:3000/` and the psychology summary page at `http://localhost:3000/profile-summary`.

### Build & lint

```bash
npm run lint
npm run build
```

## Architecture Notes

- `app/matchTeam.ts` defines reusable KaibanJS agents + tasks and exposes helper functions invoked by the API route.
- `app/api/generate/route.ts` stores per-session state in-memory, handles Whisper transcription, orchestrates stages, calls Pinecone, and returns payloads for the UI.
- `app/page.tsx` is a client component that mirrors the server phase machine, manages voice recording + dropdowns, and renders summary/match/feedback cards.
- `app/profile-summary/page.tsx` renders the exit summary using sessionStorage data (MVP scope—swap for persistent storage later).
- All external services (OpenAI + Pinecone) are optional at dev time, but the API will error if they aren’t configured when those phases are triggered.

## Deployment

The project targets Vercel. Set the same environment variables inside your Vercel project dashboard (`Settings → Environment Variables`) and run `vercel --prod` once the build passes locally.
