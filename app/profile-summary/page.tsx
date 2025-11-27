'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { PsychologyProfile } from '../matchTeam';

export default function ProfileSummaryPage() {
  const router = useRouter();
  const profile = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const stored = sessionStorage.getItem('matchmaker:profile');
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored) as PsychologyProfile;
    } catch {
      return null;
    }
  }, []);

  if (!profile) {
    return (
      <section className="chat-card">
        <h1>Psychology profile</h1>
        <p>No profile found for this session. Start a new conversation.</p>
        <button type="button" onClick={() => router.push('/')}>
          Back to chat
        </button>
      </section>
    );
  }

  return (
    <main className="page">
      <section className="chat-card">
        <header className="chat-header">
          <div>
            <h1 className="app-title">Psychology Summary</h1>
            <p className="app-subtitle">
              Anchored in today&apos;s conversation with the Matchmaker agent.
            </p>
          </div>
        </header>

        <article className="card">
          <h2>You in this moment</h2>
          <p>{profile.profileSummary}</p>
          <div className="card-section">
            <strong>Strengths</strong>
            <ul>
              {profile.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="card-section">
            <strong>Growth edges</strong>
            <ul>
              {profile.growthAreas.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="card-section">
            <strong>Suggested experiment</strong>
            <p>{profile.suggestedExperiment}</p>
          </div>
        </article>

        <button type="button" className="exit-button" onClick={() => router.push('/')}>
          Back to chat
        </button>
      </section>
    </main>
  );
}
