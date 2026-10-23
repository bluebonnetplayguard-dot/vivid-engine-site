// Rule 0: the ONLY sources Vivid Engine Legal Research may ingest, index, embed, cache or send to a model.
// Anything not listed here is rejected by the ingestion pipeline (src/allowlist.ts) and fails the
// index guard test (test/index-guard.test.ts).
//
// Before a source can be ingested in full, its terms must be read and recorded here
// (termsReviewed: true, termsSummary filled in). Until then it is link-only: we may link to it,
// but never store or embed its text.

export type Jurisdiction = 'TX' | 'LA' | 'US' | '5th-Cir';
export type Access = 'full' | 'link-only';

export interface LegalSource {
  id: string;
  name: string;
  domains: string[];
  jurisdictions: Jurisdiction[];
  docTypes: Array<'case' | 'statute' | 'rule' | 'regulation' | 'form' | 'self-help'>;
  license: string;
  licenseUrl: string;
  termsUrl: string;
  termsReviewed: boolean;
  termsSummary: string;
  access: Access;
  // false = development only (blocked when NODE_ENV=production unless its flag is set).
  productionAllowed: () => boolean;
  notes?: string;
}

const env = (name: string): string | undefined =>
  (typeof process !== 'undefined' ? process.env[name] : undefined);

// Set COURTLISTENER_COMMERCIAL=true only after signing a commercial agreement with Free Law Project.
export const COURTLISTENER_COMMERCIAL = () => env('COURTLISTENER_COMMERCIAL') === 'true';

export const LEGAL_SOURCES: LegalSource[] = [
  {
    id: 'cap',
    name: 'Caselaw Access Project (Harvard Law School Library Innovation Lab)',
    domains: ['static.case.law', 'case.law'],
    jurisdictions: ['TX', 'LA', 'US', '5th-Cir'],
    docTypes: ['case'],
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    termsUrl: 'https://case.law/',
    termsReviewed: true,
    termsSummary: 'Bulk case law released into the public domain under CC0. Ingest opinion text only: skip head_matter, which can include publisher syllabi or headnotes.',
    access: 'full',
    productionAllowed: () => true,
    notes: 'Coverage ends around 2018-2020 for most reporters. Recent opinions need CourtListener or the courts.',
  },
  {
    id: 'courtlistener',
    name: 'CourtListener (Free Law Project)',
    domains: ['www.courtlistener.com', 'courtlistener.com', 'storage.courtlistener.com'],
    jurisdictions: ['TX', 'LA', 'US', '5th-Cir'],
    docTypes: ['case'],
    license: 'Free Law Project terms: free use is personal, research and exploratory; commercial use needs an agreement',
    licenseUrl: 'https://free.law/',
    termsUrl: 'https://www.courtlistener.com/terms/',
    termsReviewed: false,
    termsSummary: 'Record the commercial agreement terms here once signed.',
    access: 'full',
    productionAllowed: COURTLISTENER_COMMERCIAL,
    notes: 'Adapter runs in development only until COURTLISTENER_COMMERCIAL=true.',
  },
  {
    id: 'tx-statutes',
    name: 'Texas Constitution and Statutes (Texas Legislative Council)',
    domains: ['statutes.capitol.texas.gov', 'tcss.legis.texas.gov', 'capitol.texas.gov'],
    jurisdictions: ['TX'],
    docTypes: ['statute'],
    license: 'Official government text',
    licenseUrl: 'https://statutes.capitol.texas.gov/',
    termsUrl: 'https://statutes.capitol.texas.gov/',
    termsReviewed: false,
    termsSummary: 'Read and record the site terms before full ingestion.',
    access: 'link-only',
    productionAllowed: () => true,
  },
  {
    id: 'tx-admin-code',
    name: 'Texas Administrative Code (Texas Secretary of State)',
    domains: ['texreg.sos.state.tx.us', 'www.sos.state.tx.us', 'www.sos.texas.gov', 'sos.texas.gov'],
    jurisdictions: ['TX'],
    docTypes: ['regulation'],
    license: 'Official government text',
    licenseUrl: 'https://www.sos.texas.gov/',
    termsUrl: 'https://www.sos.texas.gov/',
    termsReviewed: false,
    termsSummary: 'Read and record the site terms before full ingestion.',
    access: 'link-only',
    productionAllowed: () => true,
  },
  {
    id: 'tx-courts',
    name: 'Texas Judicial Branch (rules, opinions, self-help)',
    domains: ['www.txcourts.gov', 'txcourts.gov', 'search.txcourts.gov'],
    jurisdictions: ['TX'],
    docTypes: ['rule', 'case', 'form', 'self-help'],
    license: 'Official government text',
    licenseUrl: 'https://www.txcourts.gov/',
    termsUrl: 'https://www.txcourts.gov/',
    termsReviewed: false,
    termsSummary: 'Read and record the site terms before full ingestion.',
    access: 'link-only',
    productionAllowed: () => true,
  },
  {
    id: 'la-legislature',
    name: 'Louisiana State Legislature (Revised Statutes, Civil Code, Codes of Procedure)',
    domains: ['legis.la.gov', 'www.legis.la.gov'],
    jurisdictions: ['LA'],
    docTypes: ['statute'],
    license: 'Official government text',
    licenseUrl: 'https://legis.la.gov/',
    termsUrl: 'https://legis.la.gov/',
    termsReviewed: false,
    termsSummary: 'Read and record the site terms before full ingestion.',
    access: 'link-only',
    productionAllowed: () => true,
    notes: 'Civil-law materials. Always stored and answered separately from Texas.',
  },
  {
    id: 'la-supreme-court',
    name: 'Louisiana Supreme Court',
    domains: ['www.lasc.org', 'lasc.org'],
    jurisdictions: ['LA'],
    docTypes: ['case', 'rule'],
    license: 'Official government text',
    licenseUrl: 'https://www.lasc.org/',
    termsUrl: 'https://www.lasc.org/',
    termsReviewed: false,
    termsSummary: 'Read and record the site terms before full ingestion.',
    access: 'link-only',
    productionAllowed: () => true,
  },
  {
    id: 'ecfr',
    name: 'Electronic Code of Federal Regulations',
    domains: ['www.ecfr.gov', 'ecfr.gov'],
    jurisdictions: ['US'],
    docTypes: ['regulation'],
    license: 'U.S. government work (17 U.S.C. § 105)',
    licenseUrl: 'https://www.ecfr.gov/',
    termsUrl: 'https://www.ecfr.gov/reader-aids/using-ecfr',
    termsReviewed: false,
    termsSummary: 'Federal text is public domain; record API usage terms before full ingestion.',
    access: 'link-only',
    productionAllowed: () => true,
  },
  {
    id: 'federal-register',
    name: 'Federal Register',
    domains: ['www.federalregister.gov', 'federalregister.gov'],
    jurisdictions: ['US'],
    docTypes: ['regulation'],
    license: 'U.S. government work (17 U.S.C. § 105)',
    licenseUrl: 'https://www.federalregister.gov/',
    termsUrl: 'https://www.federalregister.gov/developers/documentation/api/v1',
    termsReviewed: false,
    termsSummary: 'Record API usage terms before full ingestion.',
    access: 'link-only',
    productionAllowed: () => true,
  },
  {
    id: 'govinfo',
    name: 'GovInfo (U.S. Code)',
    domains: ['www.govinfo.gov', 'govinfo.gov', 'api.govinfo.gov', 'uscode.house.gov'],
    jurisdictions: ['US'],
    docTypes: ['statute'],
    license: 'U.S. government work (17 U.S.C. § 105)',
    licenseUrl: 'https://www.govinfo.gov/',
    termsUrl: 'https://www.govinfo.gov/about/policies',
    termsReviewed: false,
    termsSummary: 'Record API usage terms before full ingestion.',
    access: 'link-only',
    productionAllowed: () => true,
  },
];

// Licensed research services: never ingested, indexed, embedded, cached or sent to a model,
// even if a connector to them exists in this environment.
export const BLOCKED_DOMAINS = [
  'westlaw.com', 'next.westlaw.com', 'thomsonreuters.com', 'tr.com', 'cocounsel.com', 'casetext.com',
  'harvey.ai', 'lexisnexis.com', 'lexis.com', 'advance.lexis.com', 'bloomberglaw.com', 'bloombergindustry.com',
  'vlex.com', 'fastcase.com', 'law360.com', 'practicallaw.thomsonreuters.com',
];
export const BLOCKED_SOURCE_NAMES = /westlaw|thomson\s*reuters|cocounsel|casetext|harvey|lexis|bloomberg\s*law|vlex|fastcase/i;
