'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  DropdownSelections,
  PreferenceSummary,
  SessionPhase,
  MatchNarrative,
  PsychologyProfile
} from './matchTeam';

type PresentedMatch = {
  id: string;
  narrative: MatchNarrative;
  vectorScore?: number;
  metadata?: Record<string, unknown>;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  via?: 'text' | 'voice';
  pending?: boolean;
};

type ApiResponse = {
  sessionId: string;
  phase: SessionPhase;
  agentReply?: string | null;
  summary?: PreferenceSummary | null;
  match?: PresentedMatch | null;
  profileSummary?: PsychologyProfile | null;
  transcript?: string | null;
  softCap: boolean;
  turnCount: number;
  dropdowns: DropdownSelections;
  nudge?: boolean;
};

const DEFAULT_DROPDOWNS: DropdownSelections = {
  ageBracket: '30s',
  location: 'Berlin',
  wantsKids: 'Undecided'
};

const dropdownOptions: Record<string, string[]> = {
  ageBracket: ['20s', '30s', '40s', '50s', '60s+', 'Surprise me'],
  location: ['Berlin', 'Munich', 'Hamburg', 'Cologne', 'Remote Europe'],
  wantsKids: ['Yes', 'No', 'Undecided', 'Already have']
};

export default function Home() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('collecting');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dropdowns, setDropdowns] =
    useState<DropdownSelections>(DEFAULT_DROPDOWNS);
  const [input, setInput] = useState('');
  const [summary, setSummary] = useState<PreferenceSummary | null>(null);
  const [matchCard, setMatchCard] = useState<PresentedMatch | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [softCap, setSoftCap] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  useEffect(() => {
    void initSession();
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const initSession = async () => {
    setLoadingAction('init');
    try {
      const response = await callApi({ action: 'init' });
      applyServerResponse(response);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleError = (err: unknown) => {
    if (err instanceof Error) {
      setError(err.message);
    } else {
      setError('Something went wrong. Please try again.');
    }
    window.setTimeout(() => setError(null), 5000);
  };

  const callApi = async (
    body: Record<string, unknown>,
    audioBlob?: Blob
  ): Promise<ApiResponse> => {
    const payload = {
      sessionId: sessionId ?? undefined,
      dropdowns,
      ...body
    };

    const response = await fetch('/api/generate', {
      method: 'POST',
      ...(audioBlob
        ? {
            body: (() => {
              const formData = new FormData();
              formData.append('payload', JSON.stringify(payload));
              formData.append(
                'audio',
                audioBlob,
                `voice-${Date.now()}.${audioBlob.type.includes('webm') ? 'webm' : 'm4a'}`
              );
              return formData;
            })()
          }
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
    });

    const data = (await response.json()) as ApiResponse & { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? 'Matchmaker request failed.');
    }
    return data;
  };

  const pushUserMessage = (content: string, via: 'text' | 'voice') => {
    const next: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      via
    };
    setMessages((prev) => [...prev, next]);
    return next.id;
  };

  const pushAssistantMessage = (content: string) => {
    const next: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content
    };
    setMessages((prev) => [...prev, next]);
  };

  const patchMessage = (id: string, content: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === id ? { ...msg, content, pending: false } : msg
      )
    );
  };

  const applyServerResponse = (
    body: ApiResponse,
    extra?: { voiceMessageId?: string }
  ) => {
    setSessionId(body.sessionId);
    setPhase(body.phase);
    if (body.summary !== undefined) {
      setSummary(body.summary);
    }
    if (body.match !== undefined) {
      setMatchCard(body.match);
    }
    setSoftCap(Boolean(body.nudge ?? body.softCap));
    setTurnCount(body.turnCount);
    setDropdowns(body.dropdowns);

    if (body.transcript && extra?.voiceMessageId) {
      patchMessage(extra.voiceMessageId, body.transcript);
    }

    if (body.agentReply) {
      pushAssistantMessage(body.agentReply);
    }

    if (body.profileSummary) {
      sessionStorage.setItem(
        'matchmaker:profile',
        JSON.stringify(body.profileSummary)
      );
    }
  };

  const handleSend = async () => {
    if (!input.trim()) {
      return;
    }
    setLoadingAction('send_message');
    const text = input.trim();
    setInput('');
    pushUserMessage(text, 'text');
    try {
      const response = await callApi({
        action: 'send_message',
        message: text
      });
      applyServerResponse(response);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSummaryConfirm = async () => {
    if (!summary) return;
    setLoadingAction('confirm_summary');
    try {
      const response = await callApi({ action: 'confirm_summary' });
      applyServerResponse(response);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSummaryEdit = async () => {
    setLoadingAction('request_more_questions');
    try {
      const response = await callApi({ action: 'request_more_questions' });
      applyServerResponse(response);
      setSummary(null);
      setMatchCard(null);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleAnotherMatch = async () => {
    setLoadingAction('request_new_match');
    try {
      const response = await callApi({ action: 'request_new_match' });
      applyServerResponse(response);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim()) return;
    const text = feedbackText.trim();
    setFeedbackText('');
    setLoadingAction('submit_feedback');
    pushUserMessage(text, 'text');
    try {
      const response = await callApi({
        action: 'submit_feedback',
        feedback: text
      });
      applyServerResponse(response);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleAcceptMatch = async () => {
    if (!matchCard) return;
    setLoadingAction('accept_match');
    try {
      const response = await callApi({ action: 'accept_match' });
      applyServerResponse(response);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleExit = async () => {
    setLoadingAction('leave');
    try {
      const response = await callApi({ action: 'leave' });
      applyServerResponse(response);
      router.push('/profile-summary');
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      handleError(new Error('Microphone is not available on this device.'));
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      handleError(new Error('MediaRecorder is not supported in this browser.'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsRecording(false);
        setRecordSeconds(0);
        const blob = new Blob(chunksRef.current, {
          type: mimeType.includes('webm') ? 'audio/webm' : 'audio/mp4'
        });
        chunksRef.current = [];
        if (blob.size > 0) {
          void sendVoiceBlob(blob);
        }
      };

      recorder.start();
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev + 1 >= 120) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      handleError(err);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }
  };

  const sendVoiceBlob = async (blob: Blob) => {
    setLoadingAction('send_voice');
    const placeholderId = pushUserMessage('Transcribing voice note…', 'voice');
    try {
      const response = await callApi({ action: 'send_message' }, blob);
      applyServerResponse(response, { voiceMessageId: placeholderId });
    } catch (err) {
      handleError(err);
      patchMessage(placeholderId, 'Voice note failed. Try again?');
    } finally {
      setLoadingAction(null);
    }
  };

  const disableSend =
    loadingAction === 'send_message' ||
    loadingAction === 'send_voice' ||
    !input.trim();

  const formattedTimer = useMemo(() => {
    const minutes = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
    const seconds = String(recordSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [recordSeconds]);

  return (
    <main className="page">
      <section className="chat-card">
        <header className="chat-header">
          <div>
            <h1>AI Matchmaker (MVP)</h1>
            <p className="chat-subtitle">
              Talk to your best-friend agent to describe your dream partner.
            </p>
          </div>
          <div className="phase-pill">{phase.replaceAll('_', ' ')}</div>
        </header>

        <div className="dropdown-row">
          {Object.entries(dropdownOptions).map(([key, options]) => (
            <label key={key}>
              <span>{formatDropdownLabel(key)}</span>
              <select
                value={dropdowns[key] ?? ''}
                onChange={(event) =>
                  setDropdowns((prev) => ({
                    ...prev,
                    [key]: event.target.value
                  }))
                }
              >
                {options.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        {softCap && (
          <div className="nudge-banner">
            You have reached {turnCount} turns. Grab your summary soon so we can
            exit with momentum.
          </div>
        )}

        <div className="chat-window" ref={chatRef}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`bubble ${message.role}`}
            >
              {message.content}
            </div>
          ))}
          {phase === 'matching' && (
            <div className="bubble assistant">Searching for a match…</div>
          )}
        </div>

        <div className="composer">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type your answer here…"
            disabled={loadingAction === 'send_message'}
          />
          <div className="composer-actions">
            <button
              type="button"
              className={`mic ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              disabled={loadingAction === 'send_voice'}
            >
              {isRecording ? 'Stop' : 'Mic'}
            </button>
            <span className="timer">{isRecording ? formattedTimer : '02:00'}</span>
            <button
              type="button"
              onClick={handleSend}
              disabled={disableSend}
            >
              Send
            </button>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
      </section>

      <aside className="side-panel">
        {summary && phase === 'awaiting_confirmation' && (
          <div className="card summary-card">
            <div className="card-header">
              <h2>{summary.summary.headline}</h2>
              <p>{summary.summary.synopsis}</p>
            </div>
            <div className="card-section">
              <strong>Signature traits</strong>
              <ul>
                {summary.summary.traits.map((trait) => (
                  <li key={trait}>{trait}</li>
                ))}
              </ul>
            </div>
            <div className="card-section">
              <strong>Dealbreakers</strong>
              <ul>
                {summary.summary.dealbreakers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="card-actions">
              <button
                type="button"
                onClick={handleSummaryEdit}
                disabled={loadingAction === 'request_more_questions'}
                className="ghost"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleSummaryConfirm}
                disabled={loadingAction === 'confirm_summary'}
              >
                Confirm & Match
              </button>
            </div>
          </div>
        )}

        {matchCard && (
          <div className="card match-card">
            <div className="card-header">
              <h2>{matchCard.narrative.title}</h2>
              <p>{matchCard.narrative.blurb}</p>
            </div>
            <div className="card-section">
              <strong>Why it fits</strong>
              <ul>
                {matchCard.narrative.compatibilityReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <p className="cta">{matchCard.narrative.callToAction}</p>
            <div className="card-actions">
              <button
                type="button"
                onClick={handleAnotherMatch}
                disabled={loadingAction === 'request_new_match'}
                className="ghost"
              >
                See Another
              </button>
              <button
                type="button"
                onClick={handleAcceptMatch}
                disabled={loadingAction === 'accept_match'}
              >
                I like them
              </button>
            </div>
          </div>
        )}

        {phase === 'feedback' && (
          <div className="card feedback-card">
            <h2>Give feedback</h2>
            <textarea
              placeholder="Tell Mara what resonated (or not)…"
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
            />
            <button
              type="button"
              onClick={handleFeedbackSubmit}
              disabled={
                !feedbackText.trim() ||
                loadingAction === 'submit_feedback'
              }
            >
              Send feedback
            </button>
          </div>
        )}

        <button
          type="button"
          className="exit-button"
          onClick={handleExit}
          disabled={loadingAction === 'leave'}
        >
          Exit Partner Search
        </button>
      </aside>
    </main>
  );
}

function formatDropdownLabel(key: string) {
  switch (key) {
    case 'ageBracket':
      return 'Age focus';
    case 'location':
      return 'City vibe';
    case 'wantsKids':
      return 'Kids preference';
    default:
      return key;
  }
}
