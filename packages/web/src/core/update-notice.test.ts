import { describe, expect, it } from 'vitest';
import { UpdateNotice, type UpdatePort } from './update-notice';

function fakePort() {
  let updateReady: () => void = () => undefined;
  let offlineReady: () => void = () => undefined;
  const applied: number[] = [];
  const port: UpdatePort = {
    onUpdateReady: (callback) => void (updateReady = callback),
    onOfflineReady: (callback) => void (offlineReady = callback),
    applyUpdate: () => void applied.push(1),
  };
  return { port, applied, updateReady: () => updateReady(), offlineReady: () => offlineReady() };
}

describe('UpdateNotice', () => {
  it('stays quiet until the service worker reports something', () => {
    const { port } = fakePort();
    expect(new UpdateNotice(port).get()).toEqual({ updateAvailable: false, offlineReady: false });
  });

  it('announces a new version without applying it', () => {
    const fake = fakePort();
    const notice = new UpdateNotice(fake.port);
    fake.updateReady();
    expect(notice.get().updateAvailable).toBe(true);
    expect(fake.applied).toHaveLength(0);
  });

  it('applies the update only when the judge asks for it', () => {
    const fake = fakePort();
    const notice = new UpdateNotice(fake.port);
    fake.updateReady();
    notice.apply();
    expect(fake.applied).toHaveLength(1);
  });

  it('"later" hides the notice and leaves the update waiting for the next launch', () => {
    const fake = fakePort();
    const notice = new UpdateNotice(fake.port);
    fake.updateReady();
    notice.dismiss();
    expect(notice.get().updateAvailable).toBe(false);
    expect(fake.applied).toHaveLength(0);
  });

  it('tells the judge when the app can run offline, and lets them dismiss it', () => {
    const fake = fakePort();
    const notice = new UpdateNotice(fake.port);
    fake.offlineReady();
    expect(notice.get().offlineReady).toBe(true);
    notice.dismiss();
    expect(notice.get().offlineReady).toBe(false);
  });

  it('does nothing without a service worker', () => {
    const notice = new UpdateNotice(null);
    notice.apply();
    notice.dismiss();
    expect(notice.get()).toEqual({ updateAvailable: false, offlineReady: false });
  });
});
