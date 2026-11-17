type PageShowTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export function reloadOnHistoryRestore(target: PageShowTarget, reload: () => void): () => void {
  const onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) reload();
  };

  target.addEventListener('pageshow', onPageShow);
  return () => target.removeEventListener('pageshow', onPageShow);
}
