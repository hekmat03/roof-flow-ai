import React from 'react';
import { LEGAL } from '../../lib/legal';

export interface LegalSection {
  heading: string;
  body: React.ReactNode;
}

interface Props {
  title: string;
  intro?: React.ReactNode;
  sections: LegalSection[];
}

export function LegalPage({ title, intro, sections }: Props) {
  React.useEffect(() => {
    const previous = document.title;
    document.title = `${title} | ${LEGAL.productName}`;
    window.scrollTo(0, 0);
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <main className="min-h-screen bg-white text-slate-800">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to {LEGAL.productName}
        </a>

        <h1 className="mt-6 text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {LEGAL.lastUpdated}</p>
        {intro ? <div className="mt-6 space-y-3 leading-relaxed">{intro}</div> : null}

        <div className="mt-8 space-y-8">
          {sections.map((s, i) => (
            <section key={s.heading}>
              <h2 className="text-xl font-semibold text-slate-900">
                {i + 1}. {s.heading}
              </h2>
              <div className="mt-2 space-y-3 leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 flex gap-4 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <a href="/privacy" className="hover:text-slate-900">Privacy Policy</a>
          <a href="/terms" className="hover:text-slate-900">Terms of Service</a>
        </footer>
      </div>
    </main>
  );
}
