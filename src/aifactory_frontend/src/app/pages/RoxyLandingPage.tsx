import { useState } from 'react';
import {
  Shield,
  Lock,
  Eye,
  Zap,
  CheckCircle,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Globe,
  Server,
  Activity,
  AlertTriangle,
  Users,
  Star,
  Play,
} from 'lucide-react';

// ── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-[var(--c-080c14)]/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 flex h-16 items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500">
            <Shield className="h-4 w-4 text-[var(--c-080c14)]" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Roxy</span>
        </div>

        {/* Desktop links */}
        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-400">
          {['Product', 'Solutions', 'Pricing', 'Docs', 'Blog'].map((item) => (
            <a key={item} href="#" className="hover:text-white transition-colors">
              {item}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">
            Log in
          </a>
          <a
            href="#"
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-[var(--c-080c14)] hover:bg-cyan-400 transition-colors"
          >
            Start free trial
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-slate-400 hover:text-white"
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-white/10 bg-[var(--c-080c14)] px-6 py-4 flex flex-col gap-4 text-sm text-slate-400">
          {['Product', 'Solutions', 'Pricing', 'Docs', 'Blog'].map((item) => (
            <a key={item} href="#" className="hover:text-white transition-colors">
              {item}
            </a>
          ))}
          <a
            href="#"
            className="mt-2 rounded-lg bg-cyan-500 px-4 py-2 text-center font-semibold text-[var(--c-080c14)] hover:bg-cyan-400 transition-colors"
          >
            Start free trial
          </a>
        </div>
      )}
    </header>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden bg-[var(--c-080c14)] pt-32 pb-20 lg:pt-40 lg:pb-32">
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(rgba(6,182,212,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.15) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      {/* Glow */}
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-5xl px-6 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-medium text-cyan-400">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Now with AI-powered threat detection
        </div>

        <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-white leading-tight">
          Security that{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            never sleeps
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400 leading-relaxed">
          Roxy monitors, detects, and neutralizes threats in real time — so your team can focus on
          building, not firefighting. Enterprise-grade security, zero complexity.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#"
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-7 py-3.5 text-base font-semibold text-[var(--c-080c14)] hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
          >
            Start free — no card needed
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#"
            className="flex items-center gap-2 rounded-xl border border-white/10 px-7 py-3.5 text-base font-medium text-white hover:border-white/30 hover:bg-white/5 transition-colors"
          >
            <Play className="h-4 w-4 text-cyan-400" />
            Watch 2-min demo
          </a>
        </div>

        {/* Social proof numbers */}
        <div className="mt-16 flex flex-wrap justify-center gap-10 border-t border-white/10 pt-12 text-sm text-slate-400">
          {[
            { value: '10,000+', label: 'Companies protected' },
            { value: '99.99%', label: 'Uptime SLA' },
            { value: '<30ms', label: 'Avg. detection latency' },
            { value: 'SOC 2 Type II', label: 'Certified' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <span className="text-2xl font-bold text-white">{s.value}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Dashboard mock ────────────────────────────────────────────────────────────
function DashboardPreview() {
  const events = [
    { type: 'blocked', ip: '192.168.4.21', label: 'SQL injection attempt', time: '0s ago' },
    { type: 'alert', ip: '10.0.0.55', label: 'Brute-force login (47 attempts)', time: '4s ago' },
    { type: 'blocked', ip: '203.0.113.9', label: 'Malicious payload detected', time: '11s ago' },
    { type: 'info', ip: '172.16.1.3', label: 'New API token issued', time: '23s ago' },
    { type: 'alert', ip: '198.51.100.2', label: 'Unusual data exfiltration pattern', time: '41s ago' },
  ];

  const typeColor: Record<string, string> = {
    blocked: 'text-red-400',
    alert: 'text-yellow-400',
    info: 'text-cyan-400',
  };
  const typeBg: Record<string, string> = {
    blocked: 'bg-red-500/10 border-red-500/20',
    alert: 'bg-yellow-500/10 border-yellow-500/20',
    info: 'bg-cyan-500/10 border-cyan-500/20',
  };

  return (
    <section className="bg-[var(--c-080c14)] py-12 px-6">
      <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[var(--c-0f1420)] overflow-hidden shadow-2xl shadow-black/40">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-red-500/60" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
          <span className="h-3 w-3 rounded-full bg-green-500/60" />
          <span className="ml-4 text-xs text-slate-500">Roxy Security Console — Live Feed</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE
          </span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 divide-x divide-white/10 border-b border-white/10">
          {[
            { icon: <Shield className="h-4 w-4" />, label: 'Threats blocked', value: '1,247', color: 'text-red-400' },
            { icon: <Eye className="h-4 w-4" />, label: 'Events / min', value: '3,891', color: 'text-cyan-400' },
            { icon: <Activity className="h-4 w-4" />, label: 'Endpoints', value: '584', color: 'text-blue-400' },
            { icon: <AlertTriangle className="h-4 w-4" />, label: 'Active alerts', value: '3', color: 'text-yellow-400' },
          ].map((stat) => (
            <div key={stat.label} className="px-6 py-4">
              <div className={`flex items-center gap-1.5 text-xs ${stat.color} mb-1`}>
                {stat.icon}
                {stat.label}
              </div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Event feed */}
        <div className="divide-y divide-white/5 px-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02] transition-colors">
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeBg[e.type]} ${typeColor[e.type]}`}
              >
                {e.type}
              </span>
              <code className="text-xs text-slate-400 w-28 shrink-0">{e.ip}</code>
              <span className="text-sm text-slate-300 flex-1 truncate">{e.label}</span>
              <span className="text-xs text-slate-600 shrink-0">{e.time}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Features ─────────────────────────────────────────────────────────────────
const features = [
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'Real-time threat blocking',
    desc: 'Roxy inspects every request in under 30ms — blocking SQL injection, XSS, and zero-day exploits before they reach your stack.',
    accent: 'from-red-500 to-pink-600',
  },
  {
    icon: <Eye className="h-6 w-6" />,
    title: 'Behavioral AI detection',
    desc: 'Our ML engine learns your traffic baseline and surfaces anomalies instantly — catching attacks that signatures miss.',
    accent: 'from-cyan-500 to-blue-600',
  },
  {
    icon: <Lock className="h-6 w-6" />,
    title: 'Zero-trust access control',
    desc: 'Enforce least-privilege access across every service, user, and device — with policy-as-code that scales with your org.',
    accent: 'from-violet-500 to-purple-600',
  },
  {
    icon: <Globe className="h-6 w-6" />,
    title: 'Global edge network',
    desc: 'Traffic is scrubbed at 200+ PoPs worldwide — delivering protection with sub-10ms latency for your end users.',
    accent: 'from-green-500 to-emerald-600',
  },
  {
    icon: <Server className="h-6 w-6" />,
    title: 'API & cloud-native',
    desc: 'Native integrations with AWS, GCP, Azure, and Kubernetes. Deploy via Terraform or our single-line SDK.',
    accent: 'from-orange-500 to-amber-600',
  },
  {
    icon: <Zap className="h-6 w-6" />,
    title: 'Instant incident response',
    desc: 'One-click containment, automated playbooks, and Slack/PagerDuty alerts — turn MTTD into MTTR in seconds.',
    accent: 'from-yellow-500 to-orange-500',
  },
];

function Features() {
  return (
    <section id="product" className="bg-[var(--c-0a0f1c)] py-24 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-cyan-400 uppercase tracking-widest mb-3">Platform</p>
          <h2 className="text-4xl font-bold text-white">Everything you need to stay secure</h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            One platform. Full visibility. Total control — without slowing your team down.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/10 bg-[var(--c-0f1420)] p-6 hover:border-white/20 hover:bg-[var(--c-131925)] transition-all"
            >
              <div
                className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.accent} text-white shadow-lg`}
              >
                {f.icon}
              </div>
              <h3 className="mb-2 text-base font-semibold text-white">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────
const steps = [
  {
    num: '01',
    title: 'Connect in minutes',
    desc: 'Point your DNS or drop in our SDK. Roxy starts protecting immediately — no config required.',
  },
  {
    num: '02',
    title: 'Roxy learns your traffic',
    desc: 'Within 24 hours our AI builds a behavioral baseline unique to your application and users.',
  },
  {
    num: '03',
    title: 'Threats neutralized automatically',
    desc: 'Attacks are blocked in real time. You get full audit trails, forensics, and one-click remediation.',
  },
];

function HowItWorks() {
  return (
    <section className="bg-[var(--c-080c14)] py-24 px-6">
      <div className="mx-auto max-w-4xl">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-cyan-400 uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-4xl font-bold text-white">Up and running in under 10 minutes</h2>
        </div>

        <div className="relative flex flex-col gap-0">
          {steps.map((s, i) => (
            <div key={s.num} className="flex gap-6 group">
              {/* Timeline */}
              <div className="flex flex-col items-center">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 text-sm font-bold text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                  {s.num}
                </div>
                {i < steps.length - 1 && (
                  <div className="w-px flex-1 bg-gradient-to-b from-cyan-500/30 to-transparent my-2" />
                )}
              </div>

              <div className="pb-10">
                <h3 className="text-lg font-semibold text-white mb-2">{s.title}</h3>
                <p className="text-slate-400 leading-relaxed max-w-md">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Testimonials ──────────────────────────────────────────────────────────────
const testimonials = [
  {
    quote:
      "Roxy caught a sophisticated supply-chain attack in staging that our SAST tool completely missed. Saved us from a production disaster.",
    name: 'Priya Sharma',
    title: 'Head of Security, Finova',
    avatar: 'PS',
  },
  {
    quote:
      "We replaced three point solutions with Roxy and cut our mean time to detect from 4 hours to under 2 minutes. ROI was immediate.",
    name: 'Marco Ricci',
    title: 'CTO, Cloudify',
    avatar: 'MR',
  },
  {
    quote:
      "The behavioral AI is genuinely impressive — it flagged an insider threat by correlating API patterns we'd never have thought to monitor.",
    name: 'Sarah Chen',
    title: 'VP Engineering, DataBridge',
    avatar: 'SC',
  },
];

function Testimonials() {
  return (
    <section className="bg-[var(--c-0a0f1c)] py-24 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-cyan-400 uppercase tracking-widest mb-3">Customers</p>
          <h2 className="text-4xl font-bold text-white">Trusted by security-first teams</h2>
        </div>

        {/* Logo strip */}
        <div className="flex flex-wrap justify-center gap-8 mb-16 opacity-40">
          {['Acme Corp', 'NovaTech', 'Bluewave', 'Finova', 'DataBridge', 'Cloudify'].map((name) => (
            <span key={name} className="text-sm font-semibold tracking-widest text-slate-400 uppercase">
              {name}
            </span>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl border border-white/10 bg-[var(--c-0f1420)] p-6 flex flex-col gap-4"
            >
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-cyan-400 text-cyan-400" />
                ))}
              </div>
              <p className="text-sm text-slate-300 leading-relaxed flex-1">"{t.quote}"</p>
              <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
                  {t.avatar}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.title}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────
const plans = [
  {
    name: 'Starter',
    price: '$49',
    period: '/mo',
    desc: 'For small teams getting started with security.',
    features: [
      'Up to 5 services',
      '1M requests / month',
      'Basic threat blocking',
      'Email alerts',
      '30-day log retention',
    ],
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '$199',
    period: '/mo',
    desc: 'For scaling companies that need deep visibility.',
    features: [
      'Up to 25 services',
      '10M requests / month',
      'AI behavioral detection',
      'Slack + PagerDuty alerts',
      '90-day log retention',
      'Zero-trust policies',
      'Priority support',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For large orgs with complex security requirements.',
    features: [
      'Unlimited services',
      'Unlimited requests',
      'Dedicated threat analyst',
      'Custom integrations',
      '1-year log retention',
      'SSO / SAML',
      'SLA-backed response',
    ],
    cta: 'Contact sales',
    highlight: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="bg-[var(--c-080c14)] py-24 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-cyan-400 uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-4xl font-bold text-white">Simple, transparent pricing</h2>
          <p className="mt-4 text-slate-400">14-day free trial on all plans. No credit card required.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-8 flex flex-col gap-6 ${
                p.highlight
                  ? 'border-cyan-500/50 bg-gradient-to-b from-cyan-500/10 to-[var(--c-0f1420)] shadow-xl shadow-cyan-500/10'
                  : 'border-white/10 bg-[var(--c-0f1420)]'
              }`}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-500 px-3 py-0.5 text-xs font-bold text-[var(--c-080c14)]">
                  MOST POPULAR
                </div>
              )}
              <div>
                <div className="text-sm font-semibold text-slate-400 mb-1">{p.name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">{p.price}</span>
                  <span className="text-slate-500 text-sm">{p.period}</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{p.desc}</p>
              </div>

              <ul className="flex flex-col gap-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <CheckCircle className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href="#"
                className={`mt-2 block rounded-xl px-6 py-3 text-center text-sm font-semibold transition-colors ${
                  p.highlight
                    ? 'bg-cyan-500 text-[var(--c-080c14)] hover:bg-cyan-400 shadow-lg shadow-cyan-500/20'
                    : 'border border-white/10 text-white hover:border-white/30 hover:bg-white/5'
                }`}
              >
                {p.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const faqs = [
  {
    q: 'How quickly can I get started?',
    a: "Most teams are fully protected within 10 minutes. Add a CNAME record or drop in our SDK and you're live.",
  },
  {
    q: 'Does Roxy introduce latency?',
    a: 'Our global edge network adds less than 1ms to p50 latency for the vast majority of requests.',
  },
  {
    q: 'Is my data stored? Where?',
    a: 'Traffic metadata is retained per your plan. We are SOC 2 Type II certified. Data residency options are available on Enterprise.',
  },
  {
    q: 'Can I run Roxy on-premise?',
    a: 'Yes — our Enterprise plan supports hybrid and fully on-premise deployments via our Kubernetes operator.',
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="bg-[var(--c-0a0f1c)] py-24 px-6">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white">Frequently asked questions</h2>
        </div>

        <div className="flex flex-col divide-y divide-white/10">
          {faqs.map((f, i) => (
            <div key={i} className="py-5">
              <button
                className="flex w-full items-center justify-between gap-4 text-left"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="text-base font-medium text-white">{f.q}</span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${
                    open === i ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {open === i && (
                <p className="mt-3 text-sm text-slate-400 leading-relaxed">{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA ───────────────────────────────────────────────────────────────────────
function CTA() {
  return (
    <section className="bg-[var(--c-080c14)] py-24 px-6">
      <div className="mx-auto max-w-4xl rounded-3xl border border-cyan-500/20 bg-gradient-to-b from-cyan-500/10 to-[var(--c-0f1420)] p-12 text-center shadow-2xl shadow-cyan-500/5">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/20">
          <Shield className="h-7 w-7 text-cyan-400" />
        </div>
        <h2 className="text-4xl font-extrabold text-white mb-4">
          Start protecting your systems today
        </h2>
        <p className="text-slate-400 mb-8 max-w-xl mx-auto leading-relaxed">
          Join 10,000+ companies who trust Roxy to guard their most critical systems. Set up in
          minutes. Cancel anytime.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <a
            href="#"
            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-8 py-3.5 text-base font-semibold text-[var(--c-080c14)] hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
          >
            Start free trial
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-8 py-3.5 text-base font-medium text-white hover:border-white/30 hover:bg-white/5 transition-colors"
          >
            <Users className="h-4 w-4 text-slate-400" />
            Talk to sales
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  const links = {
    Product: ['Features', 'Pricing', 'Changelog', 'Roadmap', 'Status'],
    Solutions: ['Enterprise', 'Startups', 'APIs', 'Cloud', 'Compliance'],
    Resources: ['Docs', 'Blog', 'Security', 'Case Studies', 'Community'],
    Company: ['About', 'Careers', 'Press', 'Partners', 'Contact'],
  };

  return (
    <footer className="border-t border-white/10 bg-[var(--c-080c14)] px-6 pt-16 pb-10">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500">
                <Shield className="h-4 w-4 text-[var(--c-080c14)]" strokeWidth={2.5} />
              </div>
              <span className="text-lg font-bold text-white">Roxy</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              AI-powered security for modern engineering teams.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([col, items]) => (
            <div key={col}>
              <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
                {col}
              </div>
              <ul className="flex flex-col gap-2.5">
                {items.map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-slate-500 hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-slate-600">
          <span>© 2026 Roxy Security, Inc. All rights reserved.</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-slate-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-400 transition-colors">Terms</a>
            <a href="#" className="hover:text-slate-400 transition-colors">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function RoxyLandingPage() {
  return (
    <div className="min-h-screen bg-[var(--c-080c14)] text-white antialiased">
      <Nav />
      <main>
        <Hero />
        <DashboardPreview />
        <Features />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
