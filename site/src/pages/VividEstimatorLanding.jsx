import LandingNav from "@/components/landing/LandingNav";
import EngineHero from "@/components/landing/EngineHero";
import LandingFeatures from "@/components/landing/LandingFeatures";
import LandingTrades from "@/components/landing/LandingTrades";
import LandingPricing from "@/components/landing/LandingPricing";
import LandingFooter from "@/components/landing/LandingFooter";
import { PageMeta, PAGE_META } from '@/components/SeoSchema';

export default function VividEstimatorLanding() {
  return (
    <div className="min-h-screen bg-[#070b12] text-white">
      <PageMeta {...PAGE_META.estimator} />
      <LandingNav />
      <main>
        <EngineHero />
        <LandingFeatures />
        <LandingTrades />
        <LandingPricing />
      </main>
      <LandingFooter />
      <style>{`
        @keyframes engineFloat {
          0%, 100% { transform: translate(var(--engine-x), var(--engine-y)) perspective(1000px) rotateX(4deg) rotateY(-7deg) translateY(0); }
          50% { transform: translate(var(--engine-x), var(--engine-y)) perspective(1000px) rotateX(4deg) rotateY(-7deg) translateY(-10px); }
        }
        .engine-float { animation: engineFloat 6s ease-in-out infinite; }

        @keyframes flywheelSpin { to { transform: rotate(360deg); } }
        .ve-flywheel { animation: flywheelSpin 8s linear infinite; }

        @keyframes pistonPulse {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(14px); }
        }
        .ve-pistons { animation: pistonPulse 1.3s ease-in-out infinite; }

        @keyframes energyPulse {
          0%, 100% { opacity: 0.18; }
          50% { opacity: 0.42; }
        }
        .ve-energy { animation: energyPulse 2.4s ease-in-out infinite; }

        @keyframes metricFloatOne { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes metricFloatTwo { 0%,100%{transform:translateY(0)} 50%{transform:translateY(8px)} }
        @keyframes metricFloatThree { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-5px,-6px)} }
        @keyframes metricFloatFour { 0%,100%{transform:translate(0,0)} 50%{transform:translate(6px,5px)} }
        .metric-float-1 { animation: metricFloatOne 5.8s ease-in-out infinite; }
        .metric-float-2 { animation: metricFloatTwo 6.6s ease-in-out infinite 0.6s; }
        .metric-float-3 { animation: metricFloatThree 7.2s ease-in-out infinite 1.1s; }
        .metric-float-4 { animation: metricFloatFour 6.1s ease-in-out infinite 0.3s; }

        @keyframes particleA { 0%{transform:translate(0,0);opacity:0} 12%{opacity:0.5} 88%{opacity:0.5} 100%{transform:translate(24px,-70px);opacity:0} }
        @keyframes particleB { 0%{transform:translate(0,0);opacity:0} 12%{opacity:0.45} 88%{opacity:0.45} 100%{transform:translate(-18px,-60px);opacity:0} }
        @keyframes particleC { 0%{transform:translate(0,0);opacity:0} 12%{opacity:0.4} 88%{opacity:0.4} 100%{transform:translate(12px,55px);opacity:0} }
        .particle-a { animation: particleA 9s ease-in-out infinite; }
        .particle-b { animation: particleB 11s ease-in-out infinite; }
        .particle-c { animation: particleC 10s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .engine-float, .ve-flywheel, .ve-pistons, .ve-energy,
          .metric-float-1, .metric-float-2, .metric-float-3, .metric-float-4,
          .particle-a, .particle-b, .particle-c { animation: none !important; }
        }
      `}</style>
    </div>
  );
}