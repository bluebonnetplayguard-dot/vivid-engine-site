import { Image } from '@/components/ui/image';
export default function EngineAssistant() {
  return <section id="assistant" className="engine-section engine-band"><div className="engine-wrap engine-assist">
    <div><span className="engine-caps">Included with every build</span><h2>A site assistant, <span className="engine-blue">with a person behind it</span></h2><p>Every build includes a chat assistant that answers customer questions instantly. When it needs a human touch, you or your team step in without the customer starting over.</p><ul className="engine-assist-list">{['Answers pricing, hours and service questions automatically', 'Books appointments straight into your synced calendar', 'One click hands the conversation to you, live', 'Every conversation is logged to your CRM as a lead'].map(text => <li key={text}>{text}</li>)}</ul></div>
    <div className="engine-chat" aria-label="Example client conversation"><div className="engine-chat-bar"><span><Image src="/logo-160.webp" className="engine-chat-logo" alt="" />Site Assistant</span><span className="engine-caps">Example</span></div><div className="engine-chat-body">
      <div className="engine-bubble engine-user">Do y’all do custom truck decals too?</div>
      <div className="engine-bubble"><small>Assistant</small>We handle vehicle wraps and decals. Turnaround is usually 5–7 days. Want me to check this week’s availability?</div>
      <div className="engine-bubble engine-user">Can I just talk to someone real quick</div>
      <div className="engine-bubble engine-human"><small>Marcus · Vivid Engine</small>Hey, I’ve got you. Happy to walk through pricing right now.</div>
    </div></div>
  </div></section>;
}