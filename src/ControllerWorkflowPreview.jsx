import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  buildBootstrapSteps,
  buildCombinedPreviewGraph,
  layoutWorkflowLayers,
} from './controllerWorkflowCatalog.mjs';
import './ControllerWorkflowPreview.css';

/**
 * View-only preview of bootstrap playbook chain + Contoller OpenShift workflow.
 * Does not launch jobs — shows what Run Bootstrap / Contoller will wire.
 */
export default function ControllerWorkflowPreview({
  isOpen,
  onClose,
  selectedComponents = [],
  usingAap = true,
  environment = 'prod',
  gitAutoPush = false,
  gitUrl = '',
  gitBranch = 'main',
  aapProject = '',
  aapOrganization = '',
  hubPublishAdo = false,
  hubPublishPreflight = false,
  hubPushEe = false,
  hubOnly = false,
  varsOnly = false,
}) {
  const [tab, setTab] = useState(usingAap ? 'controller' : 'bootstrap');
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const clampZoom = (value) => Math.min(2.5, Math.max(0.15, value));
  const zoomOut = () => setZoom((z) => clampZoom(Math.round((z - 0.1) * 10) / 10));
  const zoomIn = () => setZoom((z) => clampZoom(Math.round((z + 0.1) * 10) / 10));

  const fitToScreen = () => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    const w = content.offsetWidth;
    const h = content.offsetHeight;
    if (!w || !h) return;
    setNatural({ w, h });
    const fit = Math.min(
      (scroll.clientWidth - 24) / w,
      (scroll.clientHeight - 24) / h,
      1
    );
    if (Number.isFinite(fit) && fit > 0) setZoom(clampZoom(fit));
  };

  const formCtx = useMemo(() => ({
    environment,
    usingAap,
    varsOnly,
    gitAutoPush,
    gitUrl,
    gitBranch,
    aapProject,
    aapOrganization,
    hubPublishAdo,
    hubPublishPreflight,
    hubPushEe,
    hubOnly,
  }), [
    environment, usingAap, varsOnly, gitAutoPush, gitUrl, gitBranch,
    aapProject, aapOrganization, hubPublishAdo, hubPublishPreflight, hubPushEe, hubOnly,
  ]);

  const bootstrapSteps = useMemo(() => buildBootstrapSteps(formCtx), [formCtx]);
  const graph = useMemo(
    () => buildCombinedPreviewGraph(selectedComponents, formCtx),
    [selectedComponents, formCtx]
  );
  const layers = useMemo(() => layoutWorkflowLayers(graph), [graph]);

  useLayoutEffect(() => {
    if (!isOpen || tab !== 'controller') return undefined;
    let frame = 0;
    const run = () => {
      const scroll = scrollRef.current;
      if (scroll && scroll.clientHeight < 40) {
        frame = requestAnimationFrame(run);
        return;
      }
      fitToScreen();
    };
    run();
    return () => cancelAnimationFrame(frame);
  }, [isOpen, tab, graph]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!isOpen || tab !== 'controller' || !el) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const step = event.deltaY > 0 ? -0.08 : 0.08;
      setZoom((z) => clampZoom(Math.round((z + step) * 100) / 100));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isOpen, tab, graph.nodes.length]);

  if (!isOpen) return null;

  const nodeKind = (node) => {
    if (node.kind === 'bootstrap') return 'bootstrap';
    if (node.id === 'Print ADO Routes' || node.id === 'Alt Routes Workflow') return 'sink';
    return node.kind === 'workflow' ? 'workflow' : 'jt';
  };

  return (
    <div
      className="ado-wf-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ado-wf-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ado-wf-modal">
        <div className="ado-wf-header">
          <div>
            <h2 id="ado-wf-title">Workflow preview (view only)</h2>
            <p>
              Shows how this form&apos;s selection maps to bootstrap playbooks and Contoller
              job/workflow templates after sync. Nothing is launched from here.
            </p>
          </div>
          <button type="button" className="pf-v5-c-button pf-m-plain" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="ado-wf-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`ado-wf-tab${tab === 'bootstrap' ? ' is-active' : ''}`}
            aria-selected={tab === 'bootstrap'}
            onClick={() => setTab('bootstrap')}
          >
            Bootstrap playbooks
          </button>
          <button
            type="button"
            role="tab"
            className={`ado-wf-tab${tab === 'controller' ? ' is-active' : ''}`}
            aria-selected={tab === 'controller'}
            onClick={() => setTab('controller')}
          >
            Contoller JT / workflow
          </button>
        </div>

        <div className="ado-wf-body">
          {tab === 'bootstrap' && (
            <>
              <p style={{ marginTop: 0, color: '#475569', fontSize: '0.9rem' }}>
                <strong>Preflight Bootstrap</strong> — only the steps this form will actually run.
              </p>
              <ol className="ado-wf-bootstrap-list">
                {bootstrapSteps.map((step, idx) => (
                  <li key={step.id}>
                    <div className="ado-wf-step-num">{idx + 1}</div>
                    <div>
                      <div className="ado-wf-step-label">{step.label}</div>
                      <div className="ado-wf-step-detail">{step.detail}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {tab === 'controller' && (
            <>
              {!usingAap && (
                <p style={{ color: '#b45309', marginTop: 0 }}>
                  Form is set to not using AAP — Contoller objects may not be applied.
                  Graph still shows what an AAP bootstrap would wire for the selected apps.
                </p>
              )}
              <p style={{ marginTop: 0, color: '#475569', fontSize: '0.9rem' }}>
                <strong>{graph.name}</strong> — {graph.description}
                {graph.inactiveCount > 0
                  ? ` (${graph.inactiveCount} nodes hidden — component not selected).`
                  : ''}
              </p>
              <div className="ado-wf-legend">
                <span><i className="ado-wf-dot bootstrap" /> Bootstrap step</span>
                <span><i className="ado-wf-dot jt" /> Job template</span>
                <span><i className="ado-wf-dot workflow" /> Nested workflow</span>
                <span><i className="ado-wf-dot sink" /> Converge / finish</span>
              </div>
              <div className="ado-wf-zoombar">
                <button type="button" onClick={zoomOut} aria-label="Zoom out">−</button>
                <button type="button" onClick={fitToScreen} aria-label="Fit workflow to screen">
                  Fit {Math.round(zoom * 100)}%
                </button>
                <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
              </div>
              {graph.nodes.length === 0 ? (
                <div className="ado-wf-empty">
                  No Contoller workflow nodes for the current selection.
                  Select OpenShift apps (or All) on the form.
                </div>
              ) : (
                <div className="ado-wf-canvas-scroll" ref={scrollRef}>
                  <div
                    className="ado-wf-canvas-spacer"
                    style={{
                      width: natural.w ? natural.w * zoom : undefined,
                      height: natural.h ? natural.h * zoom : undefined,
                    }}
                  >
                    <div
                      className="ado-wf-canvas"
                      ref={contentRef}
                      style={{ transform: `scale(${zoom})` }}
                    >
                      <div className="ado-wf-layers">
                      {layers.map((layer, li) => (
                        <React.Fragment key={`layer-${li}`}>
                          {li > 0 && <div className="ado-wf-arrow-col" aria-hidden>→</div>}
                          <div className="ado-wf-layer">
                            <div className="ado-wf-layer-label">Stage {li + 1}</div>
                            {layer.map((node) => {
                              const kind = nodeKind(node);
                              return (
                                <div
                                  key={node.id}
                                  className={`ado-wf-node kind-${kind}`}
                                  title={node.jobTemplate}
                                >
                                  <div className="ado-wf-node-title">{node.label}</div>
                                  <div className="ado-wf-node-meta">{node.jobTemplate}</div>
                                </div>
                              );
                            })}
                          </div>
                        </React.Fragment>
                      ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="ado-wf-footer">
          <span>
            Seeded from infra.ado Contoller workflow YAML — not a live AAP API poll.
          </span>
          <button type="button" className="pf-v5-c-button pf-m-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
