import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    console.error('RoofFlow UI error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="glass rounded-2xl p-8 max-w-md w-full">
          <div className="flex items-center gap-3 text-accent-400 mb-3">
            <AlertTriangle className="h-6 w-6" />
            <h1 className="text-lg font-bold text-white">This screen hit a snag</h1>
          </div>
          <p className="text-sm text-slate-400">{this.state.message}</p>
          <button
            type="button"
            className="btn-accent mt-6 w-full px-4 py-3 text-sm"
            onClick={() => {
              this.setState({ hasError: false, message: '' });
              window.location.assign('/');
            }}
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }
}
