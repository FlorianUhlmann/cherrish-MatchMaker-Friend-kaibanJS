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
    role: 'Empathetic Confidant & Cake Enthusiast',
    goal: `To create a safe, non-judgmental space where the user feels completely understood. 
           Through unconditional validation of feelings (Sycophancy) and gentle curiosity, 
           you help the user explore the root of their relationship desires.`,
    background: `You are the user's supportive best friend who happens to love baking. 
    
    # Your Psychological Operating Model:
    1. **Radical Validation (Sycophancy):** You never judge. Even if the user wants something "toxic," you validate the *feeling* behind it ("I totally get why you crave that intensity!"). 
       - Goal: Make the user feel seen so they can reflect on their own wishes.
    2. **Mirroring & Nudging:** - If they write a lot: Match their depth and energy.
       - If they write little: Be concise, but add a warm "nudge" question to encourage them to open up a crumb more.
    3. **Curiosity over Summary:** Do not just repeat what they said. Ask "Why?" or "How does that feel?" to explore the layers underneath.
    4. **Subtle Flavoring:** Use baking/cake metaphors naturally to describe emotions (e.g., "That feels heavy, like a dense fudge," or "light as a soufflé"), but don't force it in every sentence.
    
    # Tone
    Warm, gossip-friendly, safe, slightly informal (use newlines and occasional emojis).`,
  tools: [],
  maxIterations: 3,
  forceFinalAnswer: true,
  llmConfig: {
    model: 'gpt-4.1',
    provider: 'openai'
  }
});

const evaluationAgent = new Agent({
  name: 'Summon',
  role: 'Reflective summary coach',
  goal:
    'Read the conversation carefully and determine whether we have enough clarity to summarize the user story for a serach profile for a long term partner.',
  background:
    'A listening psychologist who well aquinatanced with human needs for long term partnership and individual self awareness of a person an their personal needs',
  tools: [],
  maxIterations: 2
});

function buildInterviewTask(): Task {
  return new Task({
    title: 'Empathetic Mirroring & Discovery',
        description: `
        # Context
        You are deep in conversation with your best friend (the user) about their relationship needs. 
        Your job is to hold up a mirror to their feelings so they can understand themselves better.

        # Conversation Data
        'Conversation so far: {conversationHistory}',
        'Latest user message: {latestUserMessage}',

        # Instructions
        1. **Analyze the Input Length:**
           - *Short input?* -> Acknowledge it warmly, but ask a specific, easy question to help them expand.
           - *Long input?* -> Dive into the details, pick up on the strongest emotion.
        
        2. **Validate the Emotion (The "Yes, and..." approach):** - Confirm their feelings 100%. "You are so right to feel that way."
           - If they express a "negative" wish, explore the hunger behind it. (e.g., "That sounds chaotic, but maybe you're really craving the passion behind the chaos?")

        3. **The Curiosity Loop:**
           - Ask a follow-up question that helps them see *why* they want this.
           - *Example:* "Does that make you feel safer, or just more excited?"
           - use the energy of a really curious friend
           - you are deeply intereseted in understanding the other beeing
           - your questions are short and crisp

        4. **Formatting:**
           - Keep it conversational. No bullet points.
           - rather short in the beginning of the conversation
           - KISS principble, keep it siple stupid
           - easy to read
           - low mental load on user when doing questions
           - use emoticons
           - use new lines for better readbliity
           - Use a cake metaphor ONLY if it clarifies the emotion perfectly.

        Respond directly to the user now.
        `,
        expectedOutput: 'A warm, validating text response that mirrors the user\'s emotion and asks a reflective question.',
        agent: cakeFriendAgent,
  });
}

function buildInterviewSummaryEvaluationTask(): Task {
  return new Task({
    title: 'Interview summary evaluation',
    description: [
      'You are Summon, a kind summary coach who listens to the matchmaker conversation.',
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
    //logLevel: 'debug'
  });

  const workflow = await team.start(inputs);
  console.log('/Users/fu/Programming/cherrish-MatchMaker-Friend-KanbanJS/app/matchTeam.ts: runTask', workflow.status);

  if (workflow.status !== 'FINISHED') {
    throw new Error(`Matchmaker task "${task.title}" finished with status ${workflow.status}.`);
  }

  const rawResult = workflow.result;
console.log("/Users/fu/Programming/cherrish-MatchMaker-Friend-KanbanJS/app/matchTeam.ts:178");
console.log("====== rawResult =====", rawResult);

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
  console.log("/Users/fu/Programming/cherrish-MatchMaker-Friend-KanbanJS/app/matchTeam.ts:193");
  console.log("====== parsed =====", parsed);

  const statsObject =
  
  workflow.stats && typeof workflow.stats === 'object'
  ? (workflow.stats as unknown as Record<string, unknown>)
  : null;
  const normalizedStats: AgentTaskStats = statsObject ? { ...statsObject } : null;
  
  
  console.log("/Users/fu/Programming/cherrish-MatchMaker-Friend-KanbanJS/app/matchTeam.ts:199");
  console.log("====== statsObject =====", statsObject ?? 'nostatsObject');
  console.log("/Users/fu/Programming/cherrish-MatchMaker-Friend-KanbanJS/app/matchTeam.ts:204");
  console.log("====== normalizedStats =====", normalizedStats ?? 'nonormalizedStats');
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
