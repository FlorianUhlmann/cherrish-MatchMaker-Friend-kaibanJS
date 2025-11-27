'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent
} from 'react';
import { useRouter } from 'next/navigation';
import type {
  PreferenceSummary,
  SessionPhase,
  PsychologyProfile,
  PresentedMatch
} from './matchTeam';

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
  nudge?: boolean;
};

export default function Home() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('collecting');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const sendAfterStopRef = useRef(false);
  const recordingActiveRef = useRef(false);

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

  const pushUserMessage = (
    content: string,
    via: 'text' | 'voice',
    pending = false
  ) => {
    const next: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      via,
      pending
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

  const applyServerResponse = (body: ApiResponse) => {
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

  const appendTranscriptToComposer = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setInput((prev) => {
      if (!prev) {
        return trimmed;
      }
      const needsSpace = !/\s$/.test(prev);
      return `${prev}${needsSpace ? ' ' : ''}${trimmed}`;
    });
  };

  const sendVoiceBlob = async (blob: Blob) => {
    if (loadingAction === 'send_voice') return;
    setLoadingAction('send_voice');
    try {
      const response = await callApi({ action: 'transcribe_voice' }, blob);
      applyServerResponse(response);
      if (response.transcript) {
        appendTranscriptToComposer(response.transcript);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const clearCachedProfile = () => {
    sessionStorage.removeItem('matchmaker:profile');
  };

  const resetConversationState = () => {
    setSessionId(null);
    setPhase('collecting');
    setMessages([]);
    setInput('');
    setSummary(null);
    setMatchCard(null);
    setFeedbackText('');
    setLoadingAction(null);
    setError(null);
    setSoftCap(false);
    setTurnCount(0);
    setIsRecording(false);
    setRecordSeconds(0);
    setVolumeLevel(0);
  };

  const handleRestartChat = async () => {
    stopRecording();
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    clearCachedProfile();
    resetConversationState();
    await initSession();
  };

  const handleSend = async () => {
    if (!input.trim()) {
      return;
    }
    const text = input.trim();
    setInput('');
    setLoadingAction('send_message');
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

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (disableSend) {
        return;
      }
      void handleSend();
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

  const finalizeRecording = (shouldSend: boolean) => {
    if (!recordingActiveRef.current) return;
    sendAfterStopRef.current = shouldSend;
    stopRecording();
  };

  const toggleRecording = async () => {
    if (isRecording || loadingAction === 'send_voice') {
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
      startAudioVisualization(stream);

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
        stopAudioVisualization();
        const blob = new Blob(chunksRef.current, {
          type: mimeType.includes('webm') ? 'audio/webm' : 'audio/mp4'
        });
        chunksRef.current = [];
        const shouldSend = sendAfterStopRef.current;
        sendAfterStopRef.current = false;
        if (blob.size > 0 && shouldSend) {
          void sendVoiceBlob(blob);
        }
      };

      recorder.start();
      recordingActiveRef.current = true;
      setIsRecording(true);
      setRecordSeconds(0);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          const next = prev + 1;
          if (next >= 120) {
            finalizeRecording(true);
            return 120;
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      handleError(err);
    }
  };

  const handleRecordingConfirm = () => {
    finalizeRecording(true);
  };

  const handleRecordingAbort = () => {
    finalizeRecording(false);
  };

  const stopRecording = () => {
    recordingActiveRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }
    stopAudioVisualization();
  };

  const stopAudioVisualization = () => {
    if (meterFrameRef.current) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    setVolumeLevel(0);
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  const startAudioVisualization = (stream: MediaStream) => {
    stopAudioVisualization();
    const AudioContextCtor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    const audioContext = new AudioContextCtor();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    audioSourceRef.current = source;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i += 1) {
        sum += dataArray[i];
      }
      const average = bufferLength ? sum / bufferLength : 0;
      setVolumeLevel(average / 255);
      meterFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  };

  const disableSend =
    loadingAction === 'send_message' ||
    loadingAction === 'send_voice' ||
    !input.trim();

  return (
    <main className="page">
      <section className="chat-card">
          <header className="chat-header">
            <div>
              <h1 className="app-title">AI Matchmaker (MVP)</h1>
              <p className="app-subtitle">
                Talk to your best-friend agent to describe your dream partner.
              </p>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="restart-button"
                onClick={handleRestartChat}
                disabled={loadingAction === 'init'}
              >
                Restart chat
              </button>
              <div className="phase-pill">{phase.replaceAll('_', ' ')}</div>
            </div>
          </header>

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
            onKeyDown={handleComposerKeyDown}
            placeholder="Type your answer here…"
            disabled={loadingAction === 'send_message'}
          />
          <div className="composer-actions">
            {isRecording && (
              <div className="mic-visualizer">
                <div className="mic-meter active">
                  <span
                    className="mic-meter__level"
                    style={{
                      transform: `scaleX(${Math.max(0.08, volumeLevel)})`
                    }}
                  />
                </div>
                <span
                  className={`timer ${recordSeconds >= 110 ? 'timer--warning' : ''}`}
                >
                  {`${recordSeconds}/120s`}
                </span>
              </div>
            )}
            <div className="composer-controls">
              {isRecording ? (
                <div className="mic-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={handleRecordingAbort}
                  >
                    Abort
                  </button>
                  <button type="button" onClick={handleRecordingConfirm}>
                    OK
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`mic ${
                    loadingAction === 'send_voice' ? 'loading' : ''
                  }`}
                  onClick={toggleRecording}
                  disabled={loadingAction === 'send_voice'}
                >
                  <span className="mic-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 16 16"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M8 4a2 2 0 0 1 2 2v3a2 2 0 0 1-4 0V6a2 2 0 0 1 2-2z" />
                      <path d="M5 9a3 3 0 0 0 6 0" />
                      <line x1="8" y1="12" x2="8" y2="15" />
                      <line x1="5" y1="15" x2="11" y2="15" />
                    </svg>
                  </span>
                  <span className="mic-label">Mic</span>
                  {loadingAction === 'send_voice' && (
                    <span className="mic-spinner" aria-hidden="true" />
                  )}
                </button>
              )}
              <button
                type="button"
                className="send-button"
                onClick={handleSend}
                disabled={disableSend}
              >
                Send
              </button>
            </div>
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
