import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';

import { runInterviewTurn } from '../../matchTeam';
import type {
  PresentedMatch,
  PreferenceSummary,
  PsychologyProfile,
  SessionPhase
} from '../../matchTeam';

const SOFT_CAP_TURNS = 20;
const NO_CONVERSATION = 'No conversation yet.';
const SUMMARY_TRIGGER_TURNS = 3;

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

interface SessionState {
  id: string;
  stage: SessionPhase;
  messages: ChatMessage[];
  interviewTurns: number;
  readyForSummary: boolean;
  summary?: PreferenceSummary;
  matches: PresentedMatch[];
  currentMatch: PresentedMatch | null;
  feedbackNotes: string[];
  turnCount: number;
  softCapNotified: boolean;
  matchIteration: number;
  profileSummary?: PsychologyProfile;
  createdAt: number;
}

interface RequestPayload {
  sessionId?: string;
  action?: SessionAction;
  message?: string;
  feedback?: string;
}

interface ParsedRequest {
  payload: RequestPayload;
  audioFile: File | null;
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
  nudge?: boolean;
}

const sessionStore = new Map<string, SessionState>();
const openai =
  process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const OPENAI_TRANSCRIBE_MODEL =
  process.env.OPENAI_WHISPER_MODEL ?? 'gpt-4o-mini-transcribe';

export async function POST(request: Request) {
  try {

    const { payload, audioFile } = await parseRequest(request);
    const action = payload.action ?? 'send_message';

    const session = ensureSession(payload.sessionId);

    if (action === 'init') {
      const response = await ensureOpeningMessage(session);
      return NextResponse.json(response);
    }

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
      case 'request_new_match': {
        const response = await handleRequestNewMatch(session);
        return NextResponse.json(response);
      }
      case 'submit_feedback': {
        const response = await handleSubmitFeedback(
          session,
          payload.feedback ?? ''
        );
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
): SessionState {
  const targetId = sessionId ?? randomUUID();
  const existing = sessionStore.get(targetId);

  if (existing) {
    return existing;
  }

  const state: SessionState = {
    id: targetId,
    stage: 'collecting',
    messages: [],
    interviewTurns: 0,
    readyForSummary: false,
    summary: undefined,
    matches: [],
    currentMatch: null,
    feedbackNotes: [],
    turnCount: 0,
    softCapNotified: false,
    matchIteration: 0,
    profileSummary: undefined,
    createdAt: Date.now(),
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

  const { data } = await runInterviewTurn({
    
    conversationHistory: NO_CONVERSATION,
    latestUserMessage:
    'Introduce yourself with warmth and explain we will explore their dream partner.',
  });
  appendAssistantMessage(session, data.reply);

  return buildResponse(session, {
    agentReply: data.reply,
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

  const { data } = await runInterviewTurn({
    conversationHistory: buildConversationHistory(session),
    latestUserMessage: text,
  });

  appendAssistantMessage(session, data.reply);
  ensureSummaryReady(session);

  return {
    response: buildResponse(session, {
      agentReply: data.reply,
      summary: session.summary ?? null,
      transcript,
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
  session.matchIteration += 1;
  const match = createMatchFromSummary(session.summary, session.matchIteration);

  session.currentMatch = match;
  session.matches.push(match);
  session.stage = 'feedback';

  const matchMessage = formatMatchForChat(match);
  appendAssistantMessage(session, matchMessage);

  return buildResponse(session, {
    agentReply: matchMessage,
    match
  });
}

async function handleRequestMoreQuestions(
  session: SessionState
): Promise<ResponseBody> {
  session.summary = undefined;
  session.readyForSummary = false;
  session.stage = 'collecting';

  const { data } = await runInterviewTurn({
    conversationHistory: buildConversationHistory(session),
    latestUserMessage:
      'The user wants to explore more nuance. Ask a gentle, open-ended follow-up question.',
  });

  appendAssistantMessage(session, data.reply);

  return buildResponse(session, {
    agentReply: data.reply,
  });
}



async function handleRequestNewMatch(
  session: SessionState
): Promise<ResponseBody> {
  if (!session.summary) {
    throw new Error('We need a confirmed summary before searching again.');
  }

  session.stage = 'matching';
  session.matchIteration += 1;
  const match = createMatchFromSummary(session.summary, session.matchIteration);

  session.currentMatch = match;
  session.matches.push(match);
  session.stage = 'feedback';

  const matchMessage = formatMatchForChat(match);
  appendAssistantMessage(session, matchMessage);

  return buildResponse(session, {
    agentReply: matchMessage,
    match
  });
}

async function handleSubmitFeedback(
  session: SessionState,
  feedback: string
): Promise<ResponseBody> {
  const trimmed = feedback.trim();
  if (!trimmed) {
    throw new Error('Feedback cannot be empty.');
  }

  session.feedbackNotes.push(trimmed);
  session.stage = 'feedback';

  const reply =
    'Got it—thanks for the nuance. I will factor it into the next suggestion.';
  appendAssistantMessage(session, reply);

  return buildResponse(session, {
    agentReply: reply
  });
}

async function handleAcceptMatch(
  session: SessionState
): Promise<ResponseBody> {
  if (!session.currentMatch) {
    throw new Error('No match to accept yet.');
  }

  session.stage = 'ended';

  const reply =
    'Perfect, I saved that match for you. Exit when you are ready and I will share your profile summary.';
  appendAssistantMessage(session, reply);

  return buildResponse(session, {
    agentReply: reply,
    match: session.currentMatch
  });
}



async function handleExit(session: SessionState): Promise<ResponseBody> {
  session.stage = 'ended';
  const profile = createPsychologyProfile(session);
  session.profileSummary = profile;

  const reply =
    'All done! I captured your psychology profile for the exit page. Thanks for hanging out with me today.';
  appendAssistantMessage(session, reply);

  return buildResponse(session, {
    agentReply: reply,
    profileSummary: profile
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

function ensureSummaryReady(session: SessionState) {
  if (session.readyForSummary || session.stage !== 'collecting') {
    return;
  }

  if (session.interviewTurns >= SUMMARY_TRIGGER_TURNS) {
    session.summary = deriveSummaryFromConversation(session);
    session.readyForSummary = true;
    session.stage = 'awaiting_confirmation';
  }
}

function deriveSummaryFromConversation(session: SessionState): PreferenceSummary {
  const latestUser = [...session.messages]
    .reverse()
    .find((message) => message.role === 'user');
  const quote = latestUser?.content ?? 'Someone who shows up with curiosity.';
  const headline =
    quote.length > 60 ? `${quote.slice(0, 57)}...` : quote;
  const synopsis = `You are building toward a warm match focused on ${headline.toLowerCase()}.`;
  const traits = ['warmth', 'curiosity', 'playfulness'];
  const dealbreakers = ['dismissive listening', 'boring routines', 'lack of humor'];

  return {
    summary: {
      headline,
      synopsis,
      traits,
      dealbreakers
    },
    searchPayload: {
      searchVectorPrompt: `Find a candid partner who shares ${traits.join(
        ', '
      )} and echoes: "${quote}"`,
      metadata: {}
    }
  };
}

function createMatchFromSummary(
  summary: PreferenceSummary,
  iteration: number
): PresentedMatch {
  const baseTrait = summary.summary.traits[0] ?? 'curiosity';
  const title = iteration === 1 ? 'Warm match candidate' : `Another warm match #${iteration}`;
  const blurb = `Someone who mirrors the vibe of "${summary.summary.headline}", with a focus on ${baseTrait}.`;
  const compatibilityReasons = [
    `Shares your emphasis on ${baseTrait}`,
    `Is curious about the same kind of emotional depth you just described`,
    'Enjoys lighthearted analogies and creative storytelling as you do'
  ];

  return {
    id: `local-match-${iteration}-${Date.now()}`,
    narrative: {
      title,
      blurb,
      compatibilityReasons,
      callToAction: 'Say “I like them” or ask for another story.'
    },
    metadata: {
      iteration,
      generatedBy: 'local-matcher'
    }
  };
}

function createPsychologyProfile(session: SessionState): PsychologyProfile {
  const summary = session.summary;
  return {
    profileSummary: summary
      ? `You are carving out space for ${summary.summary.headline.toLowerCase()} with warmth and humor.`
      : 'You are curious, open, and want someone who keeps things playful.',
    strengths: summary?.summary.traits ?? ['Openness', 'Listening', 'Vulnerability'],
    growthAreas:
      session.feedbackNotes.length > 0
        ? session.feedbackNotes.slice(-3)
        : ['Let clarity slow the conversation down', 'Ask more follow-ups'],
    suggestedExperiment:
      session.feedbackNotes.length > 0
        ? `Bring the note "${session.feedbackNotes.slice(-1)[0]}" into your next conversation.`
        : 'Share a playful “what kind of cake are you?” question on the next call.'
  };
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
    nudge: session.softCapNotified,
  };
}
