import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export default function PodTerminal({ fontSize = 13 }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [sessionState, setSessionState] = useState('idle');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/terminal/status')
      .then(response => response.json())
      .then(payload => {
        if (!cancelled) setStatus(payload);
      })
      .catch(err => {
        if (!cancelled) {
          setStatus({
            available: false,
            reason: err.message || 'Failed to read terminal status'
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status?.available || !containerRef.current) {
      return undefined;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#151515',
        foreground: '#f0f0f0',
        cursor: '#f0f0f0',
        selectionBackground: '#264f78'
      },
      scrollback: 5000
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/terminal/ws`);
    wsRef.current = ws;
    setSessionState('connecting');

    const sendResize = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows
      }));
    };

    ws.onopen = () => {
      setSessionState('connected');
      sendResize();
    };

    ws.onmessage = event => {
      term.write(typeof event.data === 'string' ? event.data : String(event.data));
    };

    ws.onerror = () => {
      setSessionState('error');
      term.writeln('\r\n[terminal connection error]');
    };

    ws.onclose = () => {
      setSessionState('closed');
      term.writeln('\r\n[session closed — reconnect by switching tabs and back]');
    };

    const dataDisposable = term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      sendResize();
    });
    resizeObserver.observe(containerRef.current);

    term.focus();

    return () => {
      dataDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
  }, [status?.available]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      fitRef.current?.fit();
    }
  }, [fontSize]);

  if (status === null) {
    return (
      <div style={{ color: '#bdbdbd', fontFamily: 'monospace' }}>
        Checking pod terminal availability...
      </div>
    );
  }

  if (!status.available) {
    return (
      <div style={{ color: '#ffcc80', fontFamily: 'monospace', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700, marginBottom: '8px' }}>Pod terminal unavailable</div>
        <div>{status.reason || 'Terminal is disabled in this environment.'}</div>
        {Array.isArray(status.fallback) && status.fallback.length > 0 && (
          <pre style={{ marginTop: '12px', color: '#f0f0f0', whiteSpace: 'pre-wrap' }}>
            {status.fallback.join('\n')}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          color: sessionState === 'connected' ? '#8bc34a' : '#bdbdbd',
          fontFamily: 'monospace',
          fontSize: '12px',
          marginBottom: '6px'
        }}
      >
        {sessionState === 'connected'
          ? `Connected — ${status.shell || '/bin/bash'} in ${status.cwd || '/workspace'}`
          : `Session: ${sessionState}`}
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, width: '100%' }} />
    </div>
  );
}
