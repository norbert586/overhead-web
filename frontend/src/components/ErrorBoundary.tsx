import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError, reloadForNewVersion } from '../utils/reload';
import { recordEvent, reportToServer } from '../utils/diagnostics';

interface Props {
  children: ReactNode;
  /** Changing this clears a caught error — pass the current view so navigating away recovers. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Contains a crash to the screen it happened in. Without this, any render
 * error (or a lazy screen failing to load after a deploy) unmounted the whole
 * app to a blank page. The catch loop lives above this boundary, so catching
 * carries on even while a screen is showing the fallback.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack);
    const component = info.componentStack?.trim().split('\n')[0]?.trim() ?? null;
    recordEvent('render-crash', { message: error.message, component });
    reportToServer('render-crash', error.message, { detail: { component } });
    if (isChunkLoadError(error)) reloadForNewVersion();
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-full empty-error" role="alert">
        <div className="empty-title empty-title-error">Something went wrong</div>
        <div className="empty-body empty-body-error">
          This screen hit an error. Catching continues in the background — reload to get it back.
        </div>
        <button type="button" className="empty-error-retry" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
