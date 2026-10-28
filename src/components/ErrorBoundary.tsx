
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('UI error:', err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center text-slate-100">
        <div>
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className="text-slate-400 mb-4 text-sm">Your data is safe. Please try again.</p>
          <button
            className="bg-orange-500 text-slate-950 px-5 py-2.5 rounded-xl font-semibold"
            onClick={() => this.setState({ failed: false })}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
