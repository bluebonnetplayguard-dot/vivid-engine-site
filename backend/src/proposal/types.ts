import type { TakeoffCategory } from '../takeoff';

// Customer proposal built from a saved estimate version. Every number comes from the estimate; Claude only
// writes the wording of the introduction, the phase descriptions and the closing.

export type PhaseId = 'site' | 'structure' | 'envelope' | 'interior';

export const PHASES: { id: PhaseId; title: string; categories: TakeoffCategory[] }[] = [
  { id: 'site', title: 'Site and foundation', categories: ['concrete'] },
  { id: 'structure', title: 'Framing and structure', categories: ['framing', 'sheathing'] },
  { id: 'envelope', title: 'Exterior, roof, windows and doors', categories: ['insulation', 'exterior', 'roofing', 'openings'] },
  { id: 'interior', title: 'Interior finishes', categories: ['drywall', 'paint', 'trim', 'flooring', 'cabinets', 'countertops'] },
];

export interface ProposalParty { name: string; phone?: string; email?: string; address?: string; license?: string }

export interface ProposalOptions {
  company: ProposalParty;          // the contractor, exactly as entered; nothing is added
  customer: ProposalParty;
  projectAddress?: string;
  validDays: number;               // proposal valid for N days from the date
  includeAlternates: boolean;
  showLineItems: boolean;          // customer-facing scope bullets under each phase
  tone: 'friendly' | 'formal';
  terms?: string;                  // contractor's own terms, inserted verbatim
}

export interface ProposalPhase {
  id: PhaseId;
  title: string;
  price: number;                   // sell price: phase share of the direct cost × (price ÷ direct)
  scope: string[];                 // plain bullets built from takeoff lines (no prices)
  description: string;             // wording (Claude or template)
}

export interface ProposalAlternate { title: string; delta: number; price: number; summary: string[] }

export interface Proposal {
  engine: 'gc-proposal/1';
  wording: 'claude' | 'template';
  createdAt: string;
  validUntil: string;
  project: { name: string; designTitle: string; estimateVersion: number; address?: string };
  company: ProposalParty;
  customer: ProposalParty;
  intro: string;
  phases: ProposalPhase[];
  total: number;
  pricePerSqFt: number | null;
  floorArea: number;
  alternates: ProposalAlternate[];
  quantitiesNote: string;          // verified vs inferred, in plain words
  exclusions: string[];
  closing: string;
  terms?: string;
  notices: string[];               // internal warnings for the contractor (not part of the customer text)
  markdown: string;                // the full customer-facing proposal
}
