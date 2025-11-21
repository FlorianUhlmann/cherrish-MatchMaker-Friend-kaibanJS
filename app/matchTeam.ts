import { Agent, Task, Team } from 'kaibanjs';
import { z } from 'zod';

export type SessionPhase =
  | 'collecting'
  | 'summarizing'
  | 'awaiting_confirmation'
  | 'matching'
  | 'feedback'
  | 'ended';

export type DropdownSelections = Record<string, string>;

export interface InterviewTurnResult {
  reply: string;
  followUpIntent: string;
  readyForSummary: boolean;
  coachingNote?: string | null;
}

export interface PreferenceSummary {
  summary: {
    headline: string;
    synopsis: string;
    traits: string[];
    dealbreakers: string[];
    vibe: string;
    opportunities: string[];
  };
  searchPayload: {
    searchVectorPrompt: string;
    metadata: Record<string, string>;
    reminders: string[];
  };
}

export interface MatchNarrative {
  title: string;
  blurb: string;
  compatibilityReasons: string[];
  tone: string;
  callToAction: string;
}

export interface FeedbackCoachResponse {
  acknowledgement: string;
  followUpQuestion: string;
  summaryNote: string;
}

export interface PsychologyProfile {
  profileSummary: string;
  strengths: string[];
  growthAreas: string[];
  suggestedExperiment: string;
}

export type AgentTaskStats = Record<string, unknown> | null;

type TaskRunnerResponse<T> = { data: T; stats: AgentTaskStats };

const interviewSchema = z.object({
  reply: z.string(),
  followUpIntent: z.string(),
  readyForSummary: z.boolean(),
  coachingNote: z.string().optional().nullable()
});

const summarySchema = z.object({
  summary: z.object({
    headline: z.string(),
    synopsis: z.string(),
    traits: z.array(z.string()).min(1),
    dealbreakers: z.array(z.string()).min(1),
    vibe: z.string(),
    opportunities: z.array(z.string()).min(1)
  }),
  searchPayload: z.object({
    searchVectorPrompt: z.string(),
    metadata: z.record(z.string()),
    reminders: z.array(z.string())
  })
});

const matchSchema = z.object({
  title: z.string(),
  blurb: z.string(),
  compatibilityReasons: z.array(z.string()).min(1),
  tone: z.string(),
  callToAction: z.string()
});

const feedbackSchema = z.object({
  acknowledgement: z.string(),
  followUpQuestion: z.string(),
  summaryNote: z.string()
});

const psychologySchema = z.object({
  profileSummary: z.string(),
  strengths: z.array(z.string()).min(1),
  growthAreas: z.array(z.string()).min(1),
  suggestedExperiment: z.string()
});

const bestFriendAgent = new Agent({
  name: 'Nia',
  role: 'Best-friend style interviewer',
  goal: 'Help the user articulate their dream partner with warmth and humor',
  background:
    'Relationship coach who teases out values, motivations, turn-ons, and dealbreakers by sounding like a supportive best friend',
  tools: [],
  maxIterations: 30,
});

const summaryAgent = new Agent({
  name: 'Rafi',
  role: 'Preference synthesis strategist',
  goal: 'Convert conversations into structured search profiles and neutral summaries',
  background: 'Behavioral scientist that knows how to translate fuzzy statements into crisp partner requirements',
  tools: []
});

const matcherAgent = new Agent({
  name: 'Sol',
  role: 'Match recommendation copywriter',
  goal: 'Blend Pinecone payloads into short, human match blurbs',
  background: 'Writes concise dating profiles and rationales rooted in similarity scores',
  tools: []
});

const feedbackAgent = new Agent({
  name: 'Mara',
  role: 'Feedback integrator',
  goal: 'Probe what worked and what fell flat so the next match improves',
  background: 'Motivational interviewer who keeps conversations grounded and empathetic',
  tools: []
});

const psychologyAgent = new Agent({
  name: 'Ezra',
  role: 'Psychology profile narrator',
  goal: 'Summarize the session into a strengths-based profile',
  background: 'Positive psychology researcher focused on dating readiness',
  tools: []
});

function resolveEnv() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to run the matchmaker team.');
  }

  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_API_MODEL: process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  };
}

function parseResult<T>(raw: unknown, schema: z.ZodSchema<T>): T {
  if (raw == null) {
    throw new Error('Matchmaker task returned an empty result.');
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return schema.parse(parsed);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'unknown parse failure';
      throw new Error(
        `Unable to parse matchmaker task output. Raw value: ${raw}. Reason: ${reason}`
      );
    }
  }

  return schema.parse(raw);
}

function stringifyValue(value: unknown): string {
  if (value == null) {
    return String(value);
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function runTask<T>(
  task: Task,
  schema: z.ZodSchema<T>,
  inputs: Record<string, unknown>
): Promise<TaskRunnerResponse<T>> {
  const team = new Team({
    name: `AI Matchmaker • ${task.title}`,
    agents: [task.agent],
    tasks: [task],
    env: resolveEnv()
  });

  const workflow = await team.start(inputs);

  if (workflow.status !== 'FINISHED') {
    throw new Error(
      `Matchmaker task "${task.title}" did not finish (status: ${workflow.status}).`
    );
  }

  const rawResult = workflow.result;
  let data: T;

  try {
    data = parseResult(rawResult, schema);
  } catch (error) {
    const rawOutput = stringifyValue(rawResult);
    const dropdownSummary =
      'dropdownSummary' in inputs && inputs.dropdownSummary !== undefined
        ? stringifyValue(inputs.dropdownSummary)
        : 'n/a';
    const contextMessage = [
      `Task "${task.title}" output invalid`,
      `Expected: ${task.expectedOutput ?? 'schema description unavailable'}`,
      `dropdownSummary: ${dropdownSummary}`,
      `Raw output: ${rawOutput}`
    ].join(' | ');

    throw new Error(
      `${error instanceof Error ? error.message : 'Schema parsing failed.'} | ${contextMessage}`
    );
  }

  const stats: AgentTaskStats = workflow.stats
    ? { ...workflow.stats }
    : null;
  return { data, stats };
}

function buildInterviewTask(): Task {
  return new Task({
    title: 'Best friend interviewer turn',
    description: [
      'You are Nia, a witty best friend gathering dating preferences.',
      'Conversation so far:',
      '{conversationHistory}',
      'Latest user entry:',
      '{latestUserMessage}',
      'Dealbreaker dropdowns as JSON:',
      '{dropdownSummary}',
      'Soft-cap reached:',
      '{softCapReached}',
      'Goal: reply in <=70 words, mirror the users tone, ask a cozy follow-up, and hint when it is time to summarize.',
      'Return JSON object with keys reply, followUpIntent, readyForSummary (boolean), coachingNote (optional).',
      'Example: {"reply":"short friendly reply","followUpIntent":"cozy follow-up label","readyForSummary":false,"coachingNote":null}',
      'Respond with nothing but that JSON (no explanations, comments, or markdown).'
    ].join('\n'),
    expectedOutput:
      '{"reply":"string","followUpIntent":"string","readyForSummary":boolean,"coachingNote":"string|null"}',
    agent: bestFriendAgent,
    outputSchema: interviewSchema
  });
}

function buildSummaryTask(): Task {
  return new Task({
    title: 'Preference summary and payload',
    description: [
      'You are Rafi, translating the chat into a neutral partner search brief.',
      'Conversation transcript:',
      '{conversationHistory}',
      'Current dropdown filters JSON:',
      '{dropdownSummary}',
      'Summarize the user desires in 2-3 sentences (headline + synopsis) plus bullet traits, dealbreakers, vibe, and opportunities.',
      'Then craft a searchPayload with searchVectorPrompt, metadata (string map), and reminders for the matcher.',
      'Respond with JSON following the schema.'
    ].join('\n'),
    expectedOutput: 'Structured JSON summary + search payload',
    agent: summaryAgent,
    outputSchema: summarySchema
  });
}

function buildMatchTask(): Task {
  return new Task({
    title: 'Match recommendation blurb',
    description: [
      'You are Sol. Blend the Pinecone match snapshot with the user summary.',
      'User summary JSON:',
      '{summaryJson}',
      'Match context JSON (from Pinecone metadata and notes):',
      '{matchContext}',
      'Feedback reminders to incorporate:',
      '{feedbackHints}',
      'Write a short title, 3 sentence blurb, list of compatibility reasons (<=3), tone descriptor, and callToAction referencing next step.',
      'Respond using JSON keys title, blurb, compatibilityReasons, tone, callToAction.'
    ].join('\n'),
    expectedOutput: 'JSON match narrative',
    agent: matcherAgent,
    outputSchema: matchSchema
  });
}

function buildFeedbackTask(): Task {
  return new Task({
    title: 'Feedback follow-up',
    description: [
      'You are Mara, integrating user feedback about a suggested match.',
      'Latest user feedback:',
      '{userFeedback}',
      'Match summary JSON:',
      '{matchSummary}',
      'Craft a single acknowledgement sentence and a concise follow-up question to learn more, plus a note to store for improvements.',
      'Respond as JSON with keys acknowledgement, followUpQuestion, summaryNote.'
    ].join('\n'),
    expectedOutput: 'JSON acknowledgement, follow-up question, summary note',
    agent: feedbackAgent,
    outputSchema: feedbackSchema
  });
}

function buildPsychologyTask(): Task {
  return new Task({
    title: 'Psychology profile wrap-up',
    description: [
      'You are Ezra. Produce a strengths-forward dating readiness profile.',
      'Conversation transcript:',
      '{conversationHistory}',
      'Confirmed summary JSON:',
      '{summaryJson}',
      'Presented matches JSON list:',
      '{matchesJson}',
      'Feedback notes JSON array:',
      '{feedbackNotes}',
      'Return JSON with profileSummary (3-4 sentences), strengths (>=3 bullets), growthAreas (>=2), and suggestedExperiment (one behavioral homework idea).'
    ].join('\n'),
    expectedOutput: 'JSON profile summary output',
    agent: psychologyAgent,
    outputSchema: psychologySchema
  });
}

export async function runInterviewTurn(inputs: {
  conversationHistory: string;
  latestUserMessage: string;
  dropdownSummary: string;
  softCapReached: boolean;
}): Promise<TaskRunnerResponse<InterviewTurnResult>> {
  const task = buildInterviewTask();
  return runTask(task, interviewSchema, inputs);
}

export async function buildPreferenceSummary(inputs: {
  conversationHistory: string;
  dropdownSummary: string;
}): Promise<TaskRunnerResponse<PreferenceSummary>> {
  const task = buildSummaryTask();
  return runTask(task, summarySchema, inputs);
}

export async function craftMatchNarrative(inputs: {
  summaryJson: string;
  matchContext: string;
  feedbackHints: string;
}): Promise<TaskRunnerResponse<MatchNarrative>> {
  const task = buildMatchTask();
  return runTask(task, matchSchema, inputs);
}

export async function captureFeedbackResponse(inputs: {
  userFeedback: string;
  matchSummary: string;
}): Promise<TaskRunnerResponse<FeedbackCoachResponse>> {
  const task = buildFeedbackTask();
  return runTask(task, feedbackSchema, inputs);
}

export async function buildPsychologySummary(inputs: {
  conversationHistory: string;
  summaryJson: string;
  matchesJson: string;
  feedbackNotes: string;
}): Promise<TaskRunnerResponse<PsychologyProfile>> {
  const task = buildPsychologyTask();
  return runTask(task, psychologySchema, inputs);
}

export const matchTeamAgents = {
  bestFriendAgent,
  summaryAgent,
  matcherAgent,
  feedbackAgent,
  psychologyAgent
};
