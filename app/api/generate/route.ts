import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { randomUUID } from 'node:crypto';

import {
  buildPreferenceSummary,
  buildPsychologySummary,
  captureFeedbackResponse,
  craftMatchNarrative,
  runInterviewTurn,
  type DropdownSelections,
  type MatchNarrative,
  type PreferenceSummary,
  type PsychologyProfile,
  type SessionPhase
} from '../../matchTeam';

const SOFT_CAP_TURNS = 20;
const NO_CONVERSATION = 'No conversation yet.';

const DEFAULT_DROPDOWNS: DropdownSelections = {
  ageBracket: '30s',
  location: 'Berlin',
  wantsKids: 'Undecided'
};

type SessionAction =
  | 'init'
  | 'send_message'
  | 'confirm_summary'
  | 'request_more_questions'
  | 'submit_feedback'
  | 'request_new_match'
  | 'accept_match'
  | 'leave';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  via?: 'text' | 'voice' | 'system';
  createdAt: number;
}

interface PresentedMatch {
  id: string;
  narrative: MatchNarrative;
  vectorScore?: number;
  metadata?: Record<string, unknown>;
}

type AgentStats = Awaited<ReturnType<typeof runInterviewTurn>>['stats'];

interface SessionState {
  id: string;
  stage: SessionPhase;
  dropdowns: DropdownSelections;
  messages: ChatMessage[];
  interviewTurns: number;
  readyForSummary: boolean;
  summary?: PreferenceSummary;
  summaryStats: AgentStats;
  matchStats: AgentStats;
  feedbackStats: AgentStats;
  psychologyStats: AgentStats;
  matches: PresentedMatch[];
  currentMatch: PresentedMatch | null;
  feedbackNotes: string[];
  turnCount: number;
  softCapNotified: boolean;
  matchIteration: number;
  createdAt: number;
  profileSummary?: PsychologyProfile | null;
}

interface RequestPayload {
  sessionId?: string;
  action?: SessionAction;
  message?: string;
  dropdowns?: DropdownSelections;
  feedback?: string;
}

interface ParsedRequest {
  payload: RequestPayload;
  audioFile: File | null;
}

interface PineconeCandidate {
  id: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

interface ResponseBody {
  sessionId: string;
  phase: SessionPhase;
  agentReply?: string | null;
  summary?: PreferenceSummary | null;
  match?: PresentedMatch | null;
  profileSummary?: PsychologyProfile | null;
  transcript?: string | null;
  turnCount: number;
  softCap: boolean;
  dropdowns: DropdownSelections;
  nudge?: boolean;
  stats?: {
    interview?: AgentStats;
    summary?: AgentStats;
    match?: AgentStats;
    feedback?: AgentStats;
    psychology?: AgentStats;
  };
}

const sessionStore = new Map<string, SessionState>();
const openai =
  process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
const pinecone =
  process.env.PINECONE_API_KEY && process.env.PINECONE_API_KEY.length > 0
    ? new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
    : null;

const OPENAI_TRANSCRIBE_MODEL =
  process.env.OPENAI_WHISPER_MODEL ?? 'gpt-4o-mini-transcribe';
const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large';

export async function POST(request: Request) {
  try {

    console.log("env var", process.env)
    const { payload, audioFile } = await parseRequest(request);
    const action = payload.action ?? 'send_message';

    if (action === 'init') {
      const session = ensureSession(payload.sessionId, payload.dropdowns);
      const response = await ensureOpeningMessage(session);
      return NextResponse.json(response);
    }

    const session = ensureSession(payload.sessionId, payload.dropdowns);

    switch (action) {
      case 'send_message': {
        const { response } = await handleSendMessage(session, payload, audioFile);
        return NextResponse.json(response);
      }
      case 'confirm_summary': {
        const response = await handleConfirmSummary(session);
        return NextResponse.json(response);
      }
      case 'request_more_questions': {
        const response = await handleRequestMoreQuestions(session);
        return NextResponse.json(response);
      }
      case 'submit_feedback': {
        const response = await handleSubmitFeedback(session, payload.feedback);
        return NextResponse.json(response);
      }
      case 'request_new_match': {
        const response = await handleRequestNewMatch(session);
        return NextResponse.json(response);
      }
      case 'accept_match': {
        const response = await handleAcceptMatch(session);
        return NextResponse.json(response);
      }
      case 'leave': {
        const response = await handleExit(session);
        return NextResponse.json(response);
      }
      default:
        return NextResponse.json(
          { error: `Unsupported action "${action}".` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Matchmaker API error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error.' },
      { status: 500 }
    );
  }
}

async function parseRequest(request: Request): Promise<ParsedRequest> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const payloadField = formData.get('payload');
    if (!payloadField) {
      throw new Error('Missing payload in multipart request.');
    }
    const payload =
      typeof payloadField === 'string'
        ? JSON.parse(payloadField)
        : JSON.parse(await (payloadField as File).text());
    const audioFile = formData.get('audio');

    return {
      payload,
      audioFile: audioFile instanceof File ? audioFile : null
    };
  }

  const payload = (await request.json()) as RequestPayload;
  return { payload, audioFile: null };
}

function ensureSession(
  sessionId?: string,
  dropdowns?: DropdownSelections
): SessionState {
  const targetId = sessionId ?? randomUUID();
  const existing = sessionStore.get(targetId);

  if (existing) {
    if (dropdowns) {
      existing.dropdowns = { ...existing.dropdowns, ...dropdowns };
    }
    return existing;
  }

  const state: SessionState = {
    id: targetId,
    stage: 'collecting',
    dropdowns: { ...DEFAULT_DROPDOWNS, ...(dropdowns ?? {}) },
    messages: [],
    interviewTurns: 0,
    readyForSummary: false,
    summary: undefined,
    summaryStats: null,
    matchStats: null,
    feedbackStats: null,
    psychologyStats: null,
    matches: [],
    currentMatch: null,
    feedbackNotes: [],
    turnCount: 0,
    softCapNotified: false,
    matchIteration: 0,
    createdAt: Date.now(),
    profileSummary: null
  };

  sessionStore.set(targetId, state);
  return state;
}

async function ensureOpeningMessage(
  session: SessionState
): Promise<ResponseBody> {
  if (session.messages.length > 0) {
    return buildResponse(session);
  }

  const { data, stats } = await runInterviewTurn({
    conversationHistory: NO_CONVERSATION,
    latestUserMessage:
      'Introduce yourself with warmth and explain we will explore their dream partner.',
    dropdownSummary: JSON.stringify(session.dropdowns),
    softCapReached: false
  });

  appendAssistantMessage(session, data.reply);
  session.readyForSummary = data.readyForSummary;

  return buildResponse(session, {
    agentReply: data.reply,
    stats: { interview: stats }
  });
}

async function handleSendMessage(
  session: SessionState,
  payload: RequestPayload,
  audioFile: File | null
): Promise<{ response: ResponseBody }> {
  const isAwaitingConfirmation = session.stage === 'awaiting_confirmation';
  if (isAwaitingConfirmation) {
    session.stage = 'collecting';
    session.summary = undefined;
    session.readyForSummary = false;
  }

  let text = payload.message?.trim() ?? '';
  let transcript: string | null = null;

  if (!text && audioFile) {
    transcript = await transcribeAudio(audioFile);
    text = transcript;
  }

  if (!text) {
    throw new Error('Please provide a message or audio snippet to send.');
  }

  appendUserMessage(session, text, audioFile ? 'voice' : 'text');
  session.turnCount += 1;
  if (session.stage === 'collecting') {
    session.interviewTurns += 1;
  }

  session.softCapNotified = session.turnCount >= SOFT_CAP_TURNS;

  const { data, stats } = await runInterviewTurn({
    conversationHistory: buildConversationHistory(session),
    latestUserMessage: text,
    dropdownSummary: JSON.stringify(session.dropdowns),
    softCapReached: session.softCapNotified
  });

  appendAssistantMessage(session, data.reply);
  session.readyForSummary = data.readyForSummary;

  let summaryStats: AgentStats = null;

  if (
    session.stage === 'collecting' &&
    session.readyForSummary &&
    !session.summary
  ) {
    const { data: summary, stats: sStats } = await buildPreferenceSummary({
      conversationHistory: buildConversationHistory(session),
      dropdownSummary: JSON.stringify(session.dropdowns)
    });
    session.summary = summary;
    summaryStats = sStats;
    session.summaryStats = sStats;
    session.stage = 'awaiting_confirmation';
  } else {
    session.stage = 'collecting';
  }

  return {
    response: buildResponse(session, {
      agentReply: data.reply,
      summary: session.summary ?? null,
      transcript,
      stats: {
        interview: stats,
        summary: summaryStats ?? undefined
      }
    })
  };
}

async function handleConfirmSummary(
  session: SessionState
): Promise<ResponseBody> {
  if (!session.summary) {
    throw new Error('No summary is available to confirm yet.');
  }

  session.stage = 'matching';
  const match = await fetchMatchForSummary(session);
  if (!match) {
    appendAssistantMessage(
      session,
      'I could not find a confident match with those filters. Want to tweak the summary or dropdowns?'
    );
    session.stage = 'feedback';
    return buildResponse(session, {
      agentReply:
        'I could not find a confident match with the current filters. Try adjusting the dropdowns or ask me to collect more info.',
      match: null
    });
  }

  session.currentMatch = match;
  session.matches.push(match);
  session.stage = 'feedback';

  const matchMessage = formatMatchForChat(match);
  appendAssistantMessage(session, matchMessage);

  return buildResponse(session, {
    agentReply: matchMessage,
    match,
    stats: { match: session.matchStats }
  });
}

async function handleRequestMoreQuestions(
  session: SessionState
): Promise<ResponseBody> {
  session.summary = undefined;
  session.readyForSummary = false;
  session.stage = 'collecting';

  const { data, stats } = await runInterviewTurn({
    conversationHistory: buildConversationHistory(session),
    latestUserMessage:
      'The user asked to adjust the summary. Offer a clarifying question to gather more nuance.',
    dropdownSummary: JSON.stringify(session.dropdowns),
    softCapReached: session.softCapNotified
  });

  appendAssistantMessage(session, data.reply);

  return buildResponse(session, {
    agentReply: data.reply,
    stats: { interview: stats }
  });
}

async function handleSubmitFeedback(
  session: SessionState,
  feedback?: string
): Promise<ResponseBody> {
  if (!feedback || !feedback.trim()) {
    throw new Error('Feedback text is required.');
  }

  appendUserMessage(session, feedback.trim());
  session.feedbackNotes.push(feedback.trim());

  if (!session.currentMatch) {
    return buildResponse(session, {
      agentReply: 'Noted! I will store that feedback for future matches.'
    });
  }

  const { data, stats } = await captureFeedbackResponse({
    userFeedback: feedback,
    matchSummary: JSON.stringify(session.currentMatch.narrative)
  });

  const reply = `${data.acknowledgement} ${data.followUpQuestion}`;
  appendAssistantMessage(session, reply);
  session.feedbackStats = stats;

  return buildResponse(session, {
    agentReply: reply,
    stats: { feedback: stats }
  });
}

async function handleRequestNewMatch(
  session: SessionState
): Promise<ResponseBody> {
  if (!session.summary) {
    throw new Error('We need a confirmed summary before searching again.');
  }

  session.stage = 'matching';
  const match = await fetchMatchForSummary(session);

  if (!match) {
    appendAssistantMessage(
      session,
      'No fresh matches met your filters. Would you like to loosen the dropdowns or revisit the summary?'
    );
    session.stage = 'feedback';
    return buildResponse(session, {
      agentReply:
        'No new matches cleared the similarity threshold. Try revising dropdowns or gathering more details.',
      match: null
    });
  }

  session.currentMatch = match;
  session.matches.push(match);
  session.stage = 'feedback';

  const matchMessage = formatMatchForChat(match);
  appendAssistantMessage(session, matchMessage);

  return buildResponse(session, {
    agentReply: matchMessage,
    match,
    stats: { match: session.matchStats }
  });
}

async function handleAcceptMatch(
  session: SessionState
): Promise<ResponseBody> {
  if (!session.currentMatch) {
    throw new Error('There is no active match to accept.');
  }

  const reply =
    'Amazing! I will mark this match as accepted. When you are ready, tap "Exit Partner Search" to see your psychology snapshot.';
  appendAssistantMessage(session, reply);
  session.stage = 'feedback';

  return buildResponse(session, {
    agentReply: reply
  });
}

async function handleExit(session: SessionState): Promise<ResponseBody> {
  if (!session.summary) {
    throw new Error(
      'We need at least one summary before producing the psychology profile.'
    );
  }

  const { data, stats } = await buildPsychologySummary({
    conversationHistory: buildConversationHistory(session),
    summaryJson: JSON.stringify(session.summary),
    matchesJson: JSON.stringify(session.matches.map((m) => m.narrative)),
    feedbackNotes: JSON.stringify(session.feedbackNotes)
  });

  session.psychologyStats = stats;
  session.stage = 'ended';
  session.profileSummary = data;

  const reply =
    'All done! I captured your psychology profile for the exit page. Thanks for hanging out with me today.';
  appendAssistantMessage(session, reply);

  return buildResponse(session, {
    agentReply: reply,
    profileSummary: data,
    stats: { psychology: stats }
  });
}

async function transcribeAudio(file: File): Promise<string> {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is required for audio transcription.');
  }

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: OPENAI_TRANSCRIBE_MODEL,
    response_format: 'json',
    temperature: 0.2
  });

  if (!('text' in transcription) || !transcription.text) {
    throw new Error('Unable to transcribe the audio snippet.');
  }

  return transcription.text.trim();
}

async function fetchMatchForSummary(
  session: SessionState
): Promise<PresentedMatch | null> {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is required for matching.');
  }

  if (!pinecone || !process.env.PINECONE_INDEX) {
    throw new Error(
      'Pinecone credentials are missing. Set PINECONE_API_KEY and PINECONE_INDEX.'
    );
  }

  const embedding = await openai.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: session.summary?.searchPayload.searchVectorPrompt ?? ''
  });

  const vector = embedding.data[0]?.embedding;
  if (!vector) {
    throw new Error('Failed to build search vector from the summary payload.');
  }

  const filter = buildMetadataFilter(
    session.summary?.searchPayload.metadata ?? {},
    session.dropdowns
  );

  const namespaceClient = process.env.PINECONE_NAMESPACE
    ? pinecone
        .index(process.env.PINECONE_INDEX)
        .namespace(process.env.PINECONE_NAMESPACE)
    : pinecone.index(process.env.PINECONE_INDEX);

  const queryResponse = await namespaceClient.query({
    topK: 1,
    includeMetadata: true,
    includeValues: false,
    vector,
    filter
  });

  const candidate = (queryResponse.matches?.[0] ?? null) as PineconeCandidate | null;

  if (!candidate) {
    return null;
  }

  const { data, stats } = await craftMatchNarrative({
    summaryJson: JSON.stringify(session.summary),
    matchContext: JSON.stringify({
      vectorScore: candidate.score ?? null,
      metadata: candidate.metadata ?? {},
      pineconeId: candidate.id
    }),
    feedbackHints: JSON.stringify(session.feedbackNotes.slice(-3))
  });

  session.matchStats = stats;
  session.matchIteration += 1;

  return {
    id: candidate.id ?? `match-${session.matchIteration}`,
    narrative: data,
    metadata: candidate.metadata ?? {},
    vectorScore: candidate.score
  };
}

function buildMetadataFilter(
  payloadMeta: Record<string, string>,
  dropdowns: DropdownSelections
): Record<string, unknown> {
  const entries = { ...payloadMeta, ...dropdowns };
  return Object.entries(entries).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (value && typeof value === 'string') {
        acc[key] = { $eq: value };
      }
      return acc;
    },
    {}
  );
}

function appendUserMessage(
  session: SessionState,
  content: string,
  via: 'text' | 'voice' | 'system' = 'text'
): ChatMessage {
  const message: ChatMessage = {
    id: randomUUID(),
    role: 'user',
    content,
    via,
    createdAt: Date.now()
  };
  session.messages.push(message);
  return message;
}

function appendAssistantMessage(
  session: SessionState,
  content: string
): ChatMessage {
  const message: ChatMessage = {
    id: randomUUID(),
    role: 'assistant',
    content,
    createdAt: Date.now()
  };
  session.messages.push(message);
  return message;
}

function buildConversationHistory(session: SessionState): string {
  if (session.messages.length === 0) {
    return NO_CONVERSATION;
  }

  const recent = session.messages.slice(-20);
  return recent
    .map((msg) => `${msg.role === 'assistant' ? 'Matchmaker' : 'User'}: ${msg.content}`)
    .join('\n');
}

function formatMatchForChat(match: PresentedMatch): string {
  return [
    match.narrative.title,
    '',
    match.narrative.blurb,
    '',
    'Why it might fit:',
    ...match.narrative.compatibilityReasons.map((reason) => `• ${reason}`),
    '',
    match.narrative.callToAction
  ].join('\n');
}

function buildResponse(
  session: SessionState,
  overrides: Partial<ResponseBody> = {}
): ResponseBody {
  return {
    sessionId: session.id,
    phase: session.stage,
    agentReply: overrides.agentReply ?? null,
    summary:
      overrides.summary !== undefined ? overrides.summary : session.summary ?? null,
    match:
    overrides.match !== undefined ? overrides.match : session.currentMatch,
    profileSummary:
      overrides.profileSummary !== undefined
        ? overrides.profileSummary
        : session.profileSummary ?? null,
    transcript: overrides.transcript ?? null,
    turnCount: session.turnCount,
    softCap: session.softCapNotified,
    dropdowns: session.dropdowns,
    nudge: session.softCapNotified,
    stats: overrides.stats
  };
}
