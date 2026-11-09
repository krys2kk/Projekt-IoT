import { Component, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';

/** F14 — błąd w jednym widoku nie zawiesza całej aplikacji. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Błąd widoku:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card">
          <div className="card-body center-msg error-msg" role="alert">
            <AlertOctagon size={20} />
            <div>
              <strong>Ten widok napotkał błąd.</strong>
              <div className="muted">{this.state.error.message}</div>
            </div>
            <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>
              Spróbuj ponownie
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
