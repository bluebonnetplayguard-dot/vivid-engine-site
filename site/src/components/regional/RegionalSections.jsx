import { Link } from 'react-router-dom';
import RegionalCards from '@/components/regional/RegionalCards';

export default function RegionalSections({ sections }) {
  return sections.map(section => <section key={section.title} className={section.band ? 'band' : undefined} id={section.id}>
    <div className="wrap"><div className="head"><span className="caps">{section.label}</span><h2>{section.title}</h2>{section.description && <p>{section.description}</p>}</div>
      {section.cards && <RegionalCards cards={section.cards} columns={section.columns} />}
      {section.steps && <ol className="steps">{section.steps.map(([title, text]) => <li key={title}><b>{title}</b><span>{text}</span></li>)}</ol>}
      {section.prices && <><div className="price-row">{section.prices.map(([name, amount, unit, text], index) => <div className={index === 1 ? 'price feat' : 'price'} key={name}><span className="caps">{name}</span><b>{amount} <small>{unit}</small></b><p>{text}</p></div>)}</div><p className="payment-note">{section.paymentNote} {section.addonsLink && <><Link to="/pricing/custom-builds">See all plans &amp; add-ons</Link> · </>}{section.payInvoice && <><Link to="/pay">Pay an invoice online</Link> or </>}<Link to="/pay">{section.financingLabel || 'Pay over time with monthly payments'}</Link>.</p></>}
    </div>
  </section>);
}