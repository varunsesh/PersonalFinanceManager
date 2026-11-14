import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

// After Android reports end of speech, the final transcript arrives a moment
// later; wait this long after the last result before treating it as final.
const SETTLE_MS = 400;
// Give up waiting for a final result this long after speech ends.
const END_TIMEOUT_MS = 1500;
// How often to check whether the recognizer stopped on its own. In
// partial-results mode the plugin swallows errors (no speech, no match) and
// may never send a "stopped" event, so polling is the only reliable signal.
const POLL_MS = 1000;

// Speech-to-text through Android's recognizer. Only available in the native
// app (Android WebView has no Web Speech API). `onText` receives the running
// transcript while the user speaks; `onFinal` receives the finished
// transcript once they stop talking (or tap stop).
export function useVoiceInput({ onText, onFinal }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const callbacks = useRef({ onText, onFinal });
  callbacks.current = { onText, onFinal };
  const session = useRef(null);

  const finish = useCallback((s) => {
    if (s.done) return;
    s.done = true;
    clearTimeout(s.timer);
    clearInterval(s.poll);
    if (session.current === s) session.current = null;
    setListening(false);
    SpeechRecognition.removeAllListeners().catch(() => {});
    const text = s.transcript.trim();
    if (!s.cancelled && text) callbacks.current.onFinal(text);
  }, []);

  // Speech has ended; finalize once results settle or the timeout passes.
  const settle = useCallback(
    (s, delay) => {
      s.ended = true;
      clearTimeout(s.timer);
      s.timer = setTimeout(() => finish(s), delay);
    },
    [finish]
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    SpeechRecognition.available()
      .then(({ available }) => setSupported(available))
      .catch(() => setSupported(false));
    return () => {
      if (session.current) {
        session.current.cancelled = true;
        finish(session.current);
      }
      SpeechRecognition.stop().catch(() => {});
    };
  }, [finish]);

  const start = useCallback(async () => {
    setError(null);
    try {
      let { speechRecognition } = await SpeechRecognition.checkPermissions();
      if (speechRecognition !== 'granted') {
        ({ speechRecognition } = await SpeechRecognition.requestPermissions());
      }
      if (speechRecognition !== 'granted') {
        setError('Microphone permission is needed for voice input.');
        return;
      }

      const s = { transcript: '', ended: false, done: false, cancelled: false, timer: null, poll: null };
      session.current = s;

      await SpeechRecognition.removeAllListeners();
      await SpeechRecognition.addListener('partialResults', ({ matches }) => {
        if (s.done || !matches?.[0]) return;
        s.transcript = matches[0];
        callbacks.current.onText(matches[0]);
        if (s.ended) settle(s, SETTLE_MS);
      });
      await SpeechRecognition.addListener('listeningState', ({ status }) => {
        if (status === 'stopped' && !s.done) settle(s, END_TIMEOUT_MS);
      });

      setListening(true);
      await SpeechRecognition.start({
        language: 'en-IN',
        maxResults: 1,
        partialResults: true,
        popup: false
      });

      s.poll = setInterval(async () => {
        if (s.done || s.ended) return;
        try {
          const { listening: active } = await SpeechRecognition.isListening();
          if (!active) settle(s, SETTLE_MS * 2);
        } catch {
          settle(s, 0);
        }
      }, POLL_MS);
    } catch (err) {
      if (session.current) {
        session.current.cancelled = true;
        finish(session.current);
      }
      setListening(false);
      setError(err?.message || 'Voice input failed.');
    }
  }, [finish, settle]);

  // Stop listening and send what was heard so far.
  const stop = useCallback(async () => {
    const s = session.current;
    if (s) settle(s, END_TIMEOUT_MS);
    try {
      await SpeechRecognition.stop();
    } catch {
      // Already stopped
    }
  }, [settle]);

  // Stop listening without sending (e.g. the user started typing).
  const cancel = useCallback(async () => {
    const s = session.current;
    if (s) {
      s.cancelled = true;
      finish(s);
    }
    try {
      await SpeechRecognition.stop();
    } catch {
      // Already stopped
    }
  }, [finish]);

  return { supported, listening, error, start, stop, cancel };
}
