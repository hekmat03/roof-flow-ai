export function navigate(path: string): void {
  if (window.location.pathname === path && !window.location.search) {
    window.dispatchEvent(new PopStateEvent('popstate'));
    return;
  }
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePath(): string {
  return window.location.pathname;
}
