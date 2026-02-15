import { useEffect, useState, useCallback } from 'react';
import { parseM3U } from '../parsers/m3u';
import { parseXMLTV } from '../parsers/xmltv';
import type { Channel, EpgData, ServerConfig } from '../types';

interface ChannelDataState {
  channels: Channel[];
  epg: EpgData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook that fetches M3U + XMLTV from the server and returns parsed data.
 * Re-fetches when config changes. Provides a manual refresh function.
 */
export function useChannelData(config: ServerConfig | null) {
  const [state, setState] = useState<ChannelDataState>({
    channels: [],
    epg: null,
    loading: false,
    error: null,
  });

  const fetchData = useCallback(async () => {
    if (!config) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { host, port } = config;
      const baseUrl = `http://${host}:${port}`;

      // Fetch M3U and XMLTV in parallel
      const [m3uRes, xmltvRes] = await Promise.all([
        fetch(`${baseUrl}/iptv/channels.m3u`),
        fetch(`${baseUrl}/iptv/xmltv.xml`),
      ]);

      if (!m3uRes.ok) throw new Error(`M3U fetch failed: ${m3uRes.status}`);
      if (!xmltvRes.ok) throw new Error(`XMLTV fetch failed: ${xmltvRes.status}`);

      const [m3uText, xmltvText] = await Promise.all([
        m3uRes.text(),
        xmltvRes.text(),
      ]);

      const channels = parseM3U(m3uText, host, port);
      const epg = parseXMLTV(xmltvText, host, port);

      setState({ channels, epg, loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch channel data';
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, [config]);

  // Fetch on mount and when config changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refresh: fetchData };
}
