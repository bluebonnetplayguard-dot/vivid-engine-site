// Recognizes legal citations in text and links statutes to their official government source.
// Case citations are only recognized here; they are verified against our index or CourtListener
// before an answer is shown (citation checker, next phase).

// Texas code abbreviations → two-letter code used by statutes.capitol.texas.gov.
const TX_CODES: Array<[RegExp, string, string]> = [
  [/Prop(?:erty|\.)\s*Code/i, 'PR', 'Property Code'],
  [/Fam(?:ily|\.)\s*Code/i, 'FA', 'Family Code'],
  [/Civ(?:il|\.)\s*Prac(?:tice|\.)\s*(?:&|and)\s*Rem(?:edies|\.)\s*Code/i, 'CP', 'Civil Practice and Remedies Code'],
  [/Gov(?:ernment|'t|’t|t\.?)\s*Code/i, 'GV', 'Government Code'],
  [/Occ(?:upations|\.)\s*Code/i, 'OC', 'Occupations Code'],
  [/Penal\s*Code/i, 'PE', 'Penal Code'],
  [/Code\s*Crim(?:inal|\.)\s*Proc(?:edure|\.)/i, 'CR', 'Code of Criminal Procedure'],
  [/Bus(?:iness|\.)\s*(?:&|and)\s*Com(?:merce|\.)\s*Code/i, 'BC', 'Business and Commerce Code'],
  [/Bus(?:iness|\.)\s*Orgs?(?:anizations|\.)?\s*Code/i, 'BO', 'Business Organizations Code'],
  [/Est(?:ates|\.)\s*Code/i, 'ES', 'Estates Code'],
  [/Lab(?:or|\.)\s*Code/i, 'LA', 'Labor Code'],
  [/Ins(?:urance|\.)\s*Code/i, 'IN', 'Insurance Code'],
  [/Health\s*(?:&|and)\s*Safety\s*Code/i, 'HS', 'Health and Safety Code'],
  [/Educ(?:ation|\.)\s*Code/i, 'ED', 'Education Code'],
  [/Transp(?:ortation|\.)\s*Code/i, 'TN', 'Transportation Code'],
  [/Loc(?:al|\.)\s*Gov(?:ernment|'t|’t|t\.?)\s*Code/i, 'LG', 'Local Government Code'],
];

export interface Citation {
  raw: string;
  kind: 'tx-statute' | 'la-statute' | 'la-civil-code' | 'us-code' | 'cfr' | 'case' | 'tx-rule';
  jurisdiction: 'TX' | 'LA' | 'US';
  normalized: string;
  url?: string; // official source, when we can build one
}

const TX_STATUTE = /Tex(?:as|\.)\s+((?:[A-Z][A-Za-z.'’&]*\s*){1,6}Code|Code\s+Crim\.?\s+Proc\.?)\s*(?:Ann\.\s*)?§+\s*(\d+[A-Z]?\.\d+[A-Za-z0-9]*)/g;
const TX_RULE = /Tex\.\s*R\.\s*(Civ|Evid|App|Crim)\.\s*(?:P\.\s*)?(\d+(?:\.\d+)*[a-z]?)/g;
const LA_RS = /La\.\s*R\.\s*S\.\s*(\d+):(\d+(?:\.\d+)?)/g;
const LA_CC = /La\.\s*(?:Civ\.\s*Code|C\.\s*C\.)\s*(?:Ann\.\s*)?art\.\s*(\d+)/g;
const USC = /(\d+)\s+U\.\s*S\.\s*C\.\s*§+\s*(\d+[a-z]?)/g;
const CFR = /(\d+)\s+C\.\s*F\.\s*R\.\s*§*\s*(\d+\.\d+)/g;
const CASE = /\b(\d{1,4})\s+(S\.W\.(?:2d|3d)?|So\.\s?(?:2d|3d)?|F\.(?:2d|3d|4th)?|F\.\s?Supp\.(?:\s?2d|\s?3d)?|U\.S\.|S\.\s?Ct\.|L\.\s?Ed\.(?:\s?2d)?|Tex\.|La\.)\s+(\d{1,5})\b/g;

export function texasCodeFor(name: string) {
  const hit = TX_CODES.find(([re]) => re.test(name));
  return hit ? { code: hit[1], name: hit[2] } : null;
}

export function texasStatuteUrl(code: string, section: string) {
  const chapter = section.split('.')[0];
  return `https://statutes.capitol.texas.gov/Docs/${code}/htm/${code}.${chapter}.htm#${section}`;
}

export function findCitations(text: string): Citation[] {
  const out: Citation[] = [];
  for (const m of text.matchAll(TX_STATUTE)) {
    const code = texasCodeFor(m[1]);
    out.push({ raw: m[0], kind: 'tx-statute', jurisdiction: 'TX', normalized: code ? `Tex. ${code.name} § ${m[2]}` : m[0], url: code ? texasStatuteUrl(code.code, m[2]) : undefined });
  }
  for (const m of text.matchAll(TX_RULE)) out.push({ raw: m[0], kind: 'tx-rule', jurisdiction: 'TX', normalized: `Tex. R. ${m[1]}. ${m[1] === 'Civ' || m[1] === 'App' ? 'P. ' : ''}${m[2]}`, url: 'https://www.txcourts.gov/rules-forms/rules-standards/' });
  for (const m of text.matchAll(LA_RS)) out.push({ raw: m[0], kind: 'la-statute', jurisdiction: 'LA', normalized: `La. R.S. ${m[1]}:${m[2]}`, url: 'https://legis.la.gov/Legis/LawSearch.aspx' });
  for (const m of text.matchAll(LA_CC)) out.push({ raw: m[0], kind: 'la-civil-code', jurisdiction: 'LA', normalized: `La. Civ. Code art. ${m[1]}`, url: 'https://legis.la.gov/Legis/LawSearch.aspx' });
  for (const m of text.matchAll(USC)) out.push({ raw: m[0], kind: 'us-code', jurisdiction: 'US', normalized: `${m[1]} U.S.C. § ${m[2]}`, url: `https://www.govinfo.gov/link/uscode/${m[1]}/${m[2]}` });
  for (const m of text.matchAll(CFR)) out.push({ raw: m[0], kind: 'cfr', jurisdiction: 'US', normalized: `${m[1]} C.F.R. § ${m[2]}`, url: `https://www.ecfr.gov/current/title-${m[1]}/section-${m[2]}` });
  for (const m of text.matchAll(CASE)) {
    const reporter = m[2].replace(/\s+/g, ' ');
    out.push({ raw: m[0], kind: 'case', jurisdiction: /So\.|La\./.test(reporter) ? 'LA' : /S\.W\.|Tex\./.test(reporter) ? 'TX' : 'US', normalized: `${m[1]} ${reporter} ${m[3]}` });
  }
  return out;
}
