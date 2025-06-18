import { renderHook, act } from '@testing-library/react-hooks';
import React from 'react';
import InteractionReplay from '../InteractionReplay';

// Helper to access downloadMediaFile from hook environment
const useDownloader = () => {
  const ref = React.useRef();
  // trick: create minimal component to grab internal functions
  const Dummy = () => {
    const downloadRef = React.useRef(null);
    // eslint-disable-next-line no-undef
    downloadRef.current = React.useContext(Dummy.context).downloadMediaFile;
    ref.current = downloadRef.current;
    return null;
  };
  // eslint-disable-next-line react/display-name
  Dummy.context = React.createContext();
  return { Component: Dummy, getter: () => ref.current };
};

// Mock global fetch
global.fetch = jest.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), blob: () => Promise.resolve(new Blob()) }));

describe('downloadMediaFile', () => {
  afterEach(() => {
    fetch.mockClear();
  });

  it('uses cloud_storage_url when present', async () => {
    const log = { id: 123, media_data: { cloud_storage_url: 'https://fake-gcs/file.pcm' } };

    const { Component, getter } = useDownloader();
    renderHook(() => <Component />);

    const download = getter();
    await act(async () => {
      await download(log, 'audio');
    });

    expect(fetch).toHaveBeenCalledWith('https://fake-gcs/file.pcm', { mode: 'cors' });
  });

  it('falls back to proxy when no signed url', async () => {
    const log = { id: 456, media_data: { storage_type: 'hash_only' } };
    process.env.REACT_APP_API_URL = 'http://localhost:8080/api';

    const { Component, getter } = useDownloader();
    renderHook(() => <Component />);

    const download = getter();
    await act(async () => {
      await download(log, 'audio');
    });

    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/api/interaction-logs/media/456', { mode: 'cors' });
  });
}); 