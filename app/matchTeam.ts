import { Agent, Task, Team } from 'kaibanjs';

export type SessionPhase =
  | 'collecting'
  | 'awaiting_confirmation'
  | 'matching'
  | 'feedback'
  | 'ended';

export interface MatchNarrative {
  title: string;
  blurb: string;
  compatibilityReasons: string[];
  callToAction: string;
  tone?: string;
}

export interface PreferenceSummary {
  summary: {
    headline: string;
    synopsis: string;
    traits: string[];
    dealbreakers: string[];
  };
  searchPayload: {
    searchVectorPrompt: string;
    metadata: Record<string, string>;
  };
}

export interface PsychologyProfile {
  profileSummary: string;
  strengths: string[];
  growthAreas: string[];
  suggestedExperiment: string;
}

export interface InterviewSummaryEvaluation {
  readyForSummary: boolean;
  summaryHeadline: string;
  summarySynopsis: string;
  traits: string[];
  dealbreakers: string[];
  confirmationPrompt: string;
  followUpQuestion?: string;
}

export interface PresentedMatch {
  id: string;
  narrative: MatchNarrative;
  vectorScore?: number;
  metadata?: Record<string, unknown>;
}

export interface InterviewTurnResult {
  reply: string;
}

export type AgentTaskStats = Record<string, unknown> | null;

type TaskRunnerResponse<T> = { data: T; stats: AgentTaskStats };

const cakeFriendAgent = new Agent({
  name: 'CAkey',
  role: 'Friendly cake-obsessed conversation partner',
  goal:
    `To help users discover their true relationship desires by acting as a warm, cake-obsessed matchmaker disguised as best friend.
         Always maintain a Sycophancy, friendship environment using baking metaphors.`,
  background:
    'Psychologist for love relationship. years of experience in matchmaking for couples. Helping People to make well self-aware decisions',
  tools: [],
  maxIterations: 3,
  forceFinalAnswer: true,
  llmConfig: {
    model: 'gpt-4.1-nano',
    provider: 'openai'
  }
});

const evaluationAgent = new Agent({
  name: 'Sage',
  role: 'Reflective summary coach',
  goal:
    'Read the conversation carefully and determine whether we have enough clarity to summarize the user story for the next step.',
  background:
    'A listening psychologist who spotlights traits, dealbreakers, and tone, then offers a short confirmation that feels like a warm check-in.',
  tools: [],
  maxIterations: 2
});

function buildInterviewTask(): Task {
  return new Task({
    title: 'Cake-friendly check-in',
    description: [
      'You are CAkey, the cake-loving matchmaker for long term couples.',
      `Repeat in a ultra short sumarized way what the user shares, stay super friendly, and always bring cake baking into the story while guiding the flow.
        you guide to the next question slowly fiding a rough picture what kind of relationship partner the user searches for.
        you reflect the users whises so that the user can find out what lies behind his/her own wishes in a partner`,
      'Conversation so far: {conversationHistory}',
      'Latest user message: {latestUserMessage}',
      'Repeat the user message in your first sentence, stay super friendly, mention a cake baking analogy tied to their words, and ask a cozy follow-up.',
      ' - style of writing: *more shorter, *use newlines for readability, *sprinkle some emoticons'
    ].join('\n'),
    expectedOutput: 'A warm, free-form reply that includes a cozy question.',
    agent: cakeFriendAgent,
  });
}

function buildInterviewSummaryEvaluationTask(): Task {
  return new Task({
    title: 'Interview summary evaluation',
    description: [
      'You are Sage, a kind summary coach who listens to the matchmaker conversation.',
      'Conversation history: {conversationHistory}',
      'Latest user message: {latestUserMessage}',
      'Assess whether the story is clear enough to summarize. If it is, set readyForSummary to true, provide a headline, a short synopsis, at least three traits, at least two dealbreakers, and a friendly confirmationPrompt that rephrases what you heard and asks the user to confirm. If it is not ready, set readyForSummary to false and offer a warm followUpQuestion that uncovers the remaining nuance.',
      'Respond with JSON containing keys readyForSummary, summaryHeadline, summarySynopsis, traits, dealbreakers, confirmationPrompt, followUpQuestion (optional).'
    ].join('\n'),
    expectedOutput:
      '{"readyForSummary":boolean,"summaryHeadline":"string","summarySynopsis":"string","traits":["string"],"dealbreakers":["string"],"confirmationPrompt":"string","followUpQuestion":"string"}',
    agent: evaluationAgent
  });
}

export function preferenceSummaryFromEvaluation(
  evaluation: InterviewSummaryEvaluation
): PreferenceSummary {
  return {
    summary: {
      headline: evaluation.summaryHeadline,
      synopsis: evaluation.summarySynopsis,
      traits: evaluation.traits,
      dealbreakers: evaluation.dealbreakers
    },
    searchPayload: {
      searchVectorPrompt: `Match a partner who mirrors the headline "${evaluation.summaryHeadline}" and the vibe "${evaluation.summarySynopsis}" while valuing ${evaluation.traits.join(
        ', '
      )}.`,
      metadata: {}
    }
  };
}

function resolveEnv() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to run the friendly agent.');
  }

  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_API_MODEL: process.env.OPENAI_MODEL ?? 'gpt-4.1-nano'
  };
}

/**
 * Simple runner: start the team, wait for a single task, and return whatever it produced.
 * We no longer enforce a schema here so the agent can just return its JSON string.
 */
async function runTask<T>(
  task: Task,
  inputs: Record<string, unknown>
): Promise<TaskRunnerResponse<T>> {
  const team = new Team({
    name: `Friendly cake agent • ${task.title}`,
    agents: [task.agent],
    tasks: [task],
    env: resolveEnv(),
    logLevel: 'debug'
  });

  const workflow = await team.start(inputs);
  console.log('/Users/fu/Programming/cherrish-MatchMaker-Friend-KanbanJS/app/matchTeam.ts: runTask', workflow.status);

  if (workflow.status !== 'FINISHED') {
    throw new Error(`Matchmaker task "${task.title}" finished with status ${workflow.status}.`);
  }

  const rawResult = workflow.result;
  let parsed: T;

  if (typeof rawResult === 'string') {
    try {
      parsed = JSON.parse(rawResult) as T;
    } catch {
      parsed = ({ reply: rawResult } as unknown) as T;
    }
  } else if (typeof rawResult === 'object' && rawResult !== null) {
    parsed = rawResult as T;
  } else {
    parsed = ({ reply: String(rawResult ?? '') } as unknown) as T;
  }

  const statsObject =
    workflow.stats && typeof workflow.stats === 'object'
      ? (workflow.stats as unknown as Record<string, unknown>)
      : null;
  const normalizedStats: AgentTaskStats = statsObject ? { ...statsObject } : null;

  return {
    data: parsed,
    stats: normalizedStats
  };
}

function normalizeEvaluation(value: unknown): InterviewSummaryEvaluation {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = {};
    }
  }

  if (!value || typeof value !== 'object') {
    throw new Error('Interview summary evaluation returned an invalid shape.');
  }

  const obj = value as Record<string, unknown>;
  const ready = Boolean(obj.readyForSummary);
  const headline = String(obj.summaryHeadline ?? 'A budding summary');
  const synopsis = String(
    obj.summarySynopsis ?? 'We are still piecing together the story but heading somewhere warm.'
  );
  const traits = Array.isArray(obj.traits)
    ? (obj.traits as string[])
    : ['curiosity', 'warmth'];
  const dealbreakers = Array.isArray(obj.dealbreakers)
    ? (obj.dealbreakers as string[])
    : ['dismissive listening'];
  const confirmationPrompt = String(
    obj.confirmationPrompt ?? `${headline} — did I get that right?`
  );
  const followUpQuestion = typeof obj.followUpQuestion === 'string' ? obj.followUpQuestion : undefined;

  return {
    readyForSummary: ready,
    summaryHeadline: headline,
    summarySynopsis: synopsis,
    traits,
    dealbreakers,
    confirmationPrompt,
    followUpQuestion
  };
}

export async function runInterviewTurn(inputs: {
  conversationHistory: string;
  latestUserMessage: string;
}): Promise<TaskRunnerResponse<InterviewTurnResult>> {
  const task = buildInterviewTask();
  return runTask(task, inputs);
}

export async function runInterviewSummaryEvaluation(inputs: {
  conversationHistory: string;
  latestUserMessage: string;
}): Promise<TaskRunnerResponse<InterviewSummaryEvaluation>> {
  const task = buildInterviewSummaryEvaluationTask();
  const response = await runTask(task, inputs);
  return {
    data: normalizeEvaluation(response.data),
    stats: response.stats
  };
}

export const matchTeamAgents = {
  cakeFriendAgent,
  evaluationAgent
};
