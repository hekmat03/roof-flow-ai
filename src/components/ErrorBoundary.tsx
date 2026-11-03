
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('UI error:', err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen bg-page flex items-center justify-center p-6 text-center text-ink">
        <div>
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className="text-ink-mute mb-4 text-sm">Your data is safe. Please try again.</p>
          <button
            className="bg-gold text-gold-ink px-5 py-2.5 rounded-xl font-semibold"
            onClick={() => this.setState({ failed: false })}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
