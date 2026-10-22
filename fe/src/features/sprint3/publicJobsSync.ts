const channelName = 'ats-public-jobs';

export function notifyPublicJobsChanged() {
  if (typeof BroadcastChannel === 'undefined') return;

  const channel = new BroadcastChannel(channelName);
  channel.postMessage('changed');
  channel.close();
}

export function subscribeToPublicJobsChanges(onChange: () => void) {
  if (typeof BroadcastChannel === 'undefined') return () => {};

  const channel = new BroadcastChannel(channelName);
  channel.addEventListener('message', event => {
    if (event.data === 'changed') onChange();
  });
  return () => channel.close();
}
