import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Sparkles, Zap } from 'lucide-react';

const SUGGESTIONS = ['Change the roof to black metal', 'Show me the front of the house', 'Remove the roof', 'Show me the kitchen', 'Show me a brick version', 'Add a covered patio to the back', 'Show me the house at sunset', 'Create a modern farmhouse version'];

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

// One unified assistant: requests are answered by the instant on-device parser when possible, otherwise by
// the server's AI interpreter. Either way only validated commands reach the model.
export default function AssistantPanel({ messages, busy, onSend, aiReady }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  const list = useRef(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => rec.current?.abort?.(), []);

  const send = value => { const v = (value ?? text).trim(); if (!v || busy) return; setText(''); onSend(v); };
  const toggleMic = () => {
    if (!Recognition) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new Recognition();
    r.lang = navigator.language || 'en-US'; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = e => { const t = Array.from(e.results).map(x => x[0].transcript).join(' '); setText(t); if (e.results[e.results.length - 1].isFinal) { setListening(false); send(t); } };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    rec.current = r; setListening(true); r.start();
  };

  return <section className="gcs-assistant" aria-label="AI design assistant">
    <header><Sparkles size={16} aria-hidden="true" /><h2>AI design assistant</h2></header>
    <div className="gcs-msgs" ref={list} aria-live="polite">
      {!messages.length && <div className="gcs-msg is-ai"><p>Tell me what to change or show. I can move the camera, switch views and lighting, change any finish, make design variations, and propose window, door and patio changes for you to approve.</p></div>}
      {messages.map((m, i) => <div key={i} className={`gcs-msg is-${m.role}${m.error ? ' is-error' : ''}`}>
        <p>{m.text}</p>
        {m.notes?.length > 0 && <ul>{m.notes.map((n, j) => <li key={j}>{n}</li>)}</ul>}
        {m.errors?.length > 0 && <ul className="is-errors">{m.errors.map((n, j) => <li key={j}>{n}</li>)}</ul>}
        {m.engine && <small className="gcs-engine">{m.engine === 'instant' ? <><Zap size={11} aria-hidden="true" />instant</> : m.engine}</small>}
      </div>)}
      {busy && <div className="gcs-msg is-ai"><p className="gcs-typing">Working on it…</p></div>}
    </div>
    <div className="gcs-chips">{SUGGESTIONS.map(s => <button type="button" key={s} onClick={() => send(s)} disabled={busy}>{s}</button>)}</div>
    <form className="gcs-input" onSubmit={e => { e.preventDefault(); send(); }}>
      <input value={text} onChange={e => setText(e.target.value)} placeholder={listening ? 'Listening…' : 'Type or speak a request'} aria-label="Request for the design assistant" maxLength={1000} />
      {Recognition && <button type="button" className={`gcs-icon${listening ? ' is-live' : ''}`} onClick={toggleMic} aria-label={listening ? 'Stop listening' : 'Speak a request'}>{listening ? <MicOff size={17} /> : <Mic size={17} />}</button>}
      <button type="submit" className="gcs-icon is-primary" disabled={busy || !text.trim()} aria-label="Send"><Send size={17} /></button>
    </form>
    {!aiReady && <p className="gcs-hint">Full AI understanding turns on once the server has an AI key. Common requests like the suggestions above work now.</p>}
  </section>;
}
