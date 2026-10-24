import ReactMarkdown from 'react-markdown';

export default function RegionalLocal({ local }) {
  return <section><div className="wrap grid-2 local-layout">
    <div className="prose"><span className="caps">{local.label}</span><h2>{local.title}</h2>{local.paragraphs.map(text => <ReactMarkdown key={text}>{text}</ReactMarkdown>)}</div>
    <div className="card"><h3>{local.coverageTitle}</h3>{local.coverage.map(([name, cities]) => <p key={name}><strong>{name}:</strong> {cities}</p>)}<ReactMarkdown>{local.related}</ReactMarkdown></div>
  </div></section>;
}