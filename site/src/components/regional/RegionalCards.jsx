import { Monitor, Settings, Smartphone, CreditCard, Calendar, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
const icons = { Monitor, Settings, Smartphone, CreditCard, Calendar, Globe };

export default function RegionalCards({ cards, columns = 2 }) {
  return <div className={columns === 3 ? 'grid-3' : 'grid-2'}>{cards.map(card => {
    const Icon = icons[card.icon];
    return <article className="card" key={card.title}>
      {Icon && <Icon className="ico" strokeWidth={1.6} aria-hidden="true" />}
      <h3>{card.title}</h3>
      {card.paragraphs.map(text => <ReactMarkdown key={text}>{text}</ReactMarkdown>)}
      {card.tags && <div className="tags">{card.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
    </article>;
  })}</div>;
}