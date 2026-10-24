// Vivid Video Studio plans. Single source of truth: the pricing page reads GET /api/video/plans,
// checkout charges these amounts, and every limit below is checked by the API.
//
// Videos are edited and rendered in the customer's own browser, so exporting costs us nothing.
// What costs money is the AI work done on our servers (Oct 2026 list prices):
//   Captions (OpenAI whisper-1)              $0.006 per audio minute
//   AI voiceover (gpt-4o-mini-tts)           ~$0.015 per spoken minute (~1,000 characters)
//   Script-to-video storyboard (gpt-5-mini)  ~$0.01 per storyboard
//   Stock footage search (Pexels)            free
// Each paid plan's AI allowance costs us 25% or less of its price when fully used.
// VIDEO_DAILY_BUDGET_USD pauses AI features for the day if spend ever runs away.

export type VideoTierId = 'free' | 'creator' | 'pro' | 'studio' | 'business';
// Effects, transitions, filters and templates each carry one of these levels.
export type FeatureLevel = 'basic' | 'standard' | 'pro';
export const LEVEL_RANK: Record<FeatureLevel, number> = { basic: 0, standard: 1, pro: 2 };

export interface VideoTier {
  id: VideoTierId;
  name: string;
  tagline: string;
  priceMonthly: number;        // USD; Business is per seat
  perSeat: boolean;
  minSeats: number;
  maxHeight: number;           // export resolution (short side: 720, 1080, 2160)
  maxFps: number;
  watermark: boolean;
  exportsPerMonth: number;
  maxDurationSec: number;      // longest project that can be exported
  effectLevel: FeatureLevel;   // highest effect, transition and filter level allowed
  templateLevel: FeatureLevel;
  brandKits: number;
  projects: number;
  captionMinutes: number;      // per month (Business: per seat, pooled)
  storyboards: number;         // script-to-video drafts per month (Business: per seat, pooled)
  ttsChars: number;            // AI voiceover characters per month (Business: per seat, pooled)
  features: string[];
  badge?: string;
}

export const VIDEO_TIERS: VideoTier[] = [
  {
    id: 'free', name: 'Free', tagline: 'Edit and export short videos.', priceMonthly: 0, perSeat: false, minSeats: 1,
    maxHeight: 720, maxFps: 30, watermark: true, exportsPerMonth: 10, maxDurationSec: 180,
    effectLevel: 'basic', templateLevel: 'basic', brandKits: 0, projects: 5,
    captionMinutes: 10, storyboards: 2, ttsChars: 2000,
    features: ['720p exports with a small watermark', 'Videos up to 3 minutes', 'Basic transitions, filters and text', 'Starter templates', '10 minutes of AI captions a month', '2 AI script-to-video drafts a month'],
  },
  {
    id: 'creator', name: 'Creator', tagline: 'Clean HD videos for social media.', priceMonthly: 12, perSeat: false, minSeats: 1,
    maxHeight: 1080, maxFps: 30, watermark: false, exportsPerMonth: 60, maxDurationSec: 900,
    effectLevel: 'standard', templateLevel: 'standard', brandKits: 1, projects: 25,
    captionMinutes: 90, storyboards: 15, ttsChars: 30000,
    features: ['1080p, no watermark', 'Videos up to 15 minutes', 'All transitions, filters and text animations', 'Silence removal and auto-ducking', '1 brand kit', '90 caption minutes, 15 AI drafts, 30 min of AI voiceover'],
    badge: 'Most popular',
  },
  {
    id: 'pro', name: 'Pro', tagline: 'Advanced effects for serious editing.', priceMonthly: 29, perSeat: false, minSeats: 1,
    maxHeight: 1080, maxFps: 60, watermark: false, exportsPerMonth: 200, maxDurationSec: 1800,
    effectLevel: 'pro', templateLevel: 'pro', brandKits: 3, projects: 100,
    captionMinutes: 300, storyboards: 50, ttsChars: 100000,
    features: ['1080p at 60 fps', 'Videos up to 30 minutes', 'Pro effects: green screen, keyframes, color grades, glitch', 'Every template', '3 brand kits', '300 caption minutes, 50 AI drafts, 100 min of AI voiceover'],
  },
  {
    id: 'studio', name: 'Studio', tagline: '4K and the biggest AI allowance.', priceMonthly: 59, perSeat: false, minSeats: 1,
    maxHeight: 2160, maxFps: 60, watermark: false, exportsPerMonth: 1000, maxDurationSec: 3600,
    effectLevel: 'pro', templateLevel: 'pro', brandKits: 10, projects: 500,
    captionMinutes: 900, storyboards: 150, ttsChars: 300000,
    features: ['4K exports (on computers that support it)', 'Videos up to 60 minutes', 'Everything in Pro', '10 brand kits', '900 caption minutes, 150 AI drafts, 300 min of AI voiceover'],
  },
  {
    id: 'business', name: 'Business', tagline: 'Pro editing and shared brand kits for your team.', priceMonthly: 24, perSeat: true, minSeats: 2,
    maxHeight: 1080, maxFps: 60, watermark: false, exportsPerMonth: 200, maxDurationSec: 1800,
    effectLevel: 'pro', templateLevel: 'pro', brandKits: 10, projects: 100,
    captionMinutes: 300, storyboards: 50, ttsChars: 100000,
    features: ['Billed per seat, 2 seats minimum', 'Everything in Pro for each person', 'Brand kits shared by the whole team', 'AI allowance pooled across seats', 'Add and remove teammates any time'],
  },
];

export const videoTierById = (id: string | null | undefined): VideoTier => VIDEO_TIERS.find(t => t.id === id) ?? VIDEO_TIERS[0];
export const VIDEO_PAID_TIER_IDS = VIDEO_TIERS.filter(t => t.priceMonthly > 0).map(t => t.id);
export const VIDEO_TIER_RANK: Record<string, number> = { free: 0, creator: 1, pro: 2, business: 2.5, studio: 3 };

// Our cost estimates, recorded per use in video_usage.
export const COST = {
  transcribePerMinute: 0.006,
  ttsPerChar: 0.000015,
  storyboard: 0.01,
};

export function publicVideoTiers() {
  return VIDEO_TIERS.map(t => ({ ...t, badge: t.badge ?? null }));
}
