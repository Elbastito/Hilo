import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const generateId = () => Math.random().toString(36).substr(2, 9);
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Mono:wght@300;400&display=swap";

const T = {
  bg: "#151413", surface: "#1e1d1b", surfaceHover: "#262523",
  bubble: "#232220", bubbleActive: "#2a2826",
  accent: "#c8956c", accentDim: "rgba(200,149,108,0.15)", accentMuted: "rgba(200,149,108,0.4)",
  sage: "#7a9e7e", sageDim: "rgba(122,158,126,0.15)",
  link: "#7eaac8", linkDim: "rgba(126,170,200,0.15)", linkMuted: "rgba(126,170,200,0.4)",
  text: "#e8e2da", textSecondary: "#8a8278", textMuted: "#5c564e",
  border: "rgba(255,255,255,0.06)", borderLight: "rgba(255,255,255,0.1)",
  danger: "#c27272", dangerDim: "rgba(194,114,114,0.15)",
};

const storage = {
  get: (key) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error("Storage full:", e); } },
};

export default function Hilo() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [threadViewId, setThreadViewId] = useState(null);
  const [insertBeforeId, setInsertBeforeId] = useState(null);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [branchSelections, setBranchSelections] = useState({});
  const [relocating, setRelocating] = useState(null);
  const [linking, setLinking] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [viewingImage, setViewingImage] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const msgRefs = useRef({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!document.querySelector(`link[href="${FONT_LINK}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    const saved = storage.get("hilo-messages");
    if (saved) setMessages(saved);
  }, []);

  useEffect(() => {
    if (messages.length > 0) storage.set("hilo-messages", messages);
  }, [messages]);

  const getChildren = useCallback((id) =>
    messages.filter(m => m.replyTo === id).sort((a, b) => a.timestamp - b.timestamp)
  , [messages]);

  const getReplyCount = useCallback((id) =>
    messages.filter(m => m.replyTo === id).length
  , [messages]);

  const getThreadChain = useCallback((messageId) => {
    const map = new Map(messages.map(m => [m.id, m]));
    let chain = [];
    let cur = messageId;
    const visited = new Set();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const m = map.get(cur);
      if (!m) break;
      chain.unshift(m);
      cur = m.replyTo;
    }
    let last = messageId;
    const seen = new Set([messageId]);
    while (true) {
      const kids = messages.filter(m => m.replyTo === last && !seen.has(m.id))
        .sort((a, b) => a.timestamp - b.timestamp);
      if (!kids.length) break;
      const sel = branchSelections[last];
      const next = kids.find(c => c.id === sel) || kids[0];
      chain.push(next);
      seen.add(next.id);
      last = next.id;
    }
    return chain;
  }, [messages, branchSelections]);

  const wouldCycle = useCallback((sourceId, targetId) => {
    const map = new Map(messages.map(m => [m.id, m]));
    let cur = targetId;
    const visited = new Set();
    while (cur && !visited.has(cur)) {
      if (cur === sourceId) return true;
      visited.add(cur);
      cur = map.get(cur)?.replyTo;
    }
    return false;
  }, [messages]);

  const visibleMessages = useMemo(() => {
    if (threadViewId) return getThreadChain(threadViewId);
    return [...messages].sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, threadViewId, getThreadChain]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages.length]);

  useEffect(() => { inputRef.current?.focus(); }, [replyingTo, insertBeforeId, threadViewId]);

  useEffect(() => {
    if (flashId) { const t = setTimeout(() => setFlashId(null), 1200); return () => clearTimeout(t); }
  }, [flashId]);

  useEffect(() => {
    const handler = (e) => {
      if (selectedMsg && !e.target.closest('[data-msg-actions]') && !e.target.closest('[data-msg-bubble]')) {
        setSelectedMsg(null);
      }
      if (deleteConfirm) setDeleteConfirm(null);
    };
    document.addEventListener("click", handler);
    document.addEventListener("touchstart", handler);
    return () => { document.removeEventListener("click", handler); document.removeEventListener("touchstart", handler); };
  }, [selectedMsg, deleteConfirm]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { clearModes(); setDeleteConfirm(null); setSelectedMsg(null); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const clearModes = () => {
    setReplyingTo(null); setInsertBeforeId(null);
    setRelocating(null); setLinking(null);
  };

  const handleSend = () => {
    if (!inputText.trim() && pendingFiles.length === 0) return;
    const newMsg = {
      id: generateId(), text: inputText.trim(), timestamp: Date.now(),
      replyTo: null, links: [], images: pendingFiles.length > 0 ? [...pendingFiles] : [],
    };

    if (insertBeforeId) {
      setMessages(prev => {
        const target = prev.find(m => m.id === insertBeforeId);
        if (!target) return [...prev, { ...newMsg, replyTo: replyingTo }];
        newMsg.replyTo = target.replyTo;
        return [...prev.map(m => m.id === insertBeforeId ? { ...m, replyTo: newMsg.id } : m), newMsg];
      });
      setInsertBeforeId(null); setReplyingTo(null);
    } else if (replyingTo) {
      newMsg.replyTo = replyingTo;
      setMessages(prev => [...prev, newMsg]);
      if (threadViewId) setBranchSelections(p => ({ ...p, [replyingTo]: newMsg.id }));
      setReplyingTo(null);
    } else {
      setMessages(prev => [...prev, newMsg]);
    }
    setInputText(""); setPendingFiles([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape") clearModes();
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") return;
      if (file.type.startsWith("image/")) {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX = 1200;
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = h * MAX / w; w = MAX; }
            else { w = w * MAX / h; h = MAX; }
          }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          const data = canvas.toDataURL("image/jpeg", 0.8);
          setPendingFiles(prev => [...prev, { id: generateId(), data, name: file.name, type: "image/jpeg" }]);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          setPendingFiles(prev => [...prev, { id: generateId(), data: reader.result, name: file.name, type: file.type }]);
        };
        reader.readAsDataURL(file);
      }
    });
    e.target.value = "";
  };

  const removePendingFile = (fileId) => setPendingFiles(prev => prev.filter(f => f.id !== fileId));

  const getPreview = (id) => {
    const m = messages.find(x => x.id === id);
    if (!m) return "...";
    if (m.text) return m.text.length > 55 ? m.text.slice(0, 55) + "…" : m.text;
    if (m.images?.length) return `📎 ${m.images.length} imagen${m.images.length > 1 ? "es" : ""}`;
    return "...";
  };

  const openThread = (id) => { setThreadViewId(id); clearModes(); setSelectedMsg(null); };
  const closeThread = () => { setThreadViewId(null); clearModes(); setSelectedMsg(null); };
  const startReply = (id) => { clearModes(); setSelectedMsg(null); setReplyingTo(id); inputRef.current?.focus(); };
  const startInsertBefore = (id) => {
    const msg = messages.find(m => m.id === id);
    clearModes(); setInsertBeforeId(id); setReplyingTo(msg?.replyTo || null);
    setSelectedMsg(null); inputRef.current?.focus();
  };
  const startEdit = (id) => {
    const msg = messages.find(m => m.id === id);
    if (msg) { setEditingMsg(id); setEditText(msg.text); setSelectedMsg(null); }
  };
  const saveEdit = () => {
    if (!editText.trim() || !editingMsg) return;
    setMessages(p => p.map(m => m.id === editingMsg ? { ...m, text: editText.trim() } : m));
    setEditingMsg(null); setEditText("");
  };
  const deleteMessage = (id) => {
    setMessages(prev => {
      const target = prev.find(m => m.id === id);
      if (!target) return prev;
      return prev.filter(m => m.id !== id)
        .map(m => ({
          ...m,
          replyTo: m.replyTo === id ? target.replyTo : m.replyTo,
          links: (m.links || []).filter(l => l.targetId !== id),
        }));
    });
    setDeleteConfirm(null); setSelectedMsg(null);
    if (threadViewId === id) closeThread();
  };

  const startRelocate = (sourceId) => { clearModes(); setSelectedMsg(null); setRelocating({ sourceId }); };
  const executeRelocate = (targetId) => {
    if (!relocating) return;
    const { sourceId } = relocating;
    if (sourceId === targetId || wouldCycle(sourceId, targetId)) { setRelocating(null); return; }
    setMessages(prev => prev.map(m => m.id === sourceId ? { ...m, replyTo: targetId || null } : m));
    setRelocating(null); setFlashId(sourceId);
  };
  const relocateToRoot = () => {
    if (!relocating) return;
    setMessages(prev => prev.map(m => m.id === relocating.sourceId ? { ...m, replyTo: null } : m));
    setRelocating(null);
  };

  const startLink = (sourceId) => { clearModes(); setSelectedMsg(null); setLinking({ sourceId }); };
  const executeLink = (targetId) => {
    if (!linking) return;
    const { sourceId } = linking;
    if (sourceId === targetId) { setLinking(null); return; }
    const src = messages.find(m => m.id === sourceId);
    if (src?.links?.some(l => l.targetId === targetId)) { setLinking(null); return; }
    setMessages(prev => prev.map(m =>
      m.id === sourceId ? { ...m, links: [...(m.links || []), { targetId, id: generateId() }] } : m
    ));
    setLinking(null); setFlashId(targetId);
  };
  const removeLink = (msgId, linkId) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, links: (m.links || []).filter(l => l.id !== linkId) } : m
    ));
  };

  const navigateToMessage = (targetId) => {
    const target = messages.find(m => m.id === targetId);
    if (!target) return;
    if (threadViewId) {
      const chain = getThreadChain(threadViewId);
      if (chain.some(m => m.id === targetId)) {
        setFlashId(targetId);
        msgRefs.current[targetId]?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      closeThread();
    }
    setTimeout(() => {
      setFlashId(targetId);
      msgRefs.current[targetId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const isInThread = threadViewId !== null;
  const isSelectingTarget = relocating || linking;
  const selectingSource = relocating?.sourceId || linking?.sourceId;

  const renderMessage = (msg, index, arr) => {
    const isActive = selectedMsg === msg.id;
    const parentMsg = msg.replyTo ? messages.find(m => m.id === msg.replyTo) : null;
    const replyCount = getReplyCount(msg.id);
    const showReplyBadge = !isInThread && parentMsg;
    const showInsertButton = isInThread && index > 0;
    const isEditing = editingMsg === msg.id;
    const isDeleting = deleteConfirm === msg.id;
    const isFlashing = flashId === msg.id;
    const isSource = selectingSource === msg.id;
    const isTarget = isSelectingTarget && !isSource;
    const msgLinks = msg.links || [];
    const msgImages = msg.images || [];

    return (
      <div key={msg.id} ref={el => msgRefs.current[msg.id] = el} style={{ position: "relative" }}>
        {showInsertButton && !isSelectingTarget && (
          <div style={{
            display: "flex", justifyContent: "center", padding: "2px 0",
            opacity: isActive || insertBeforeId === msg.id ? 1 : 0, transition: "opacity 0.2s",
          }}>
            <button onClick={(e) => { e.stopPropagation(); startInsertBefore(msg.id); }}
              style={{
                background: insertBeforeId === msg.id ? T.accentDim : "transparent",
                border: `1px dashed ${insertBeforeId === msg.id ? T.accent : T.textMuted}`,
                borderRadius: 20, color: insertBeforeId === msg.id ? T.accent : T.textMuted,
                padding: "4px 16px", fontSize: 12, fontFamily: "'DM Mono', monospace",
                cursor: "pointer", letterSpacing: "0.5px",
              }}>+ insertar aquí</button>
          </div>
        )}

        {isInThread && index > 0 && (() => {
          const parentId = msg.replyTo;
          if (!parentId) return null;
          const siblings = getChildren(parentId);
          if (siblings.length <= 1) return null;
          const ci = siblings.findIndex(s => s.id === msg.id);
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "6px 0 2px" }}>
              <button onClick={() => { const p = siblings[(ci - 1 + siblings.length) % siblings.length]; setBranchSelections(s => ({ ...s, [parentId]: p.id })); }}
                style={{ background: "transparent", border: "none", color: T.accent, fontSize: 18, cursor: "pointer", fontFamily: "'DM Mono', monospace", padding: "4px 8px" }}>‹</button>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: T.accentMuted, letterSpacing: "0.5px" }}>rama {ci + 1}/{siblings.length}</span>
              <button onClick={() => { const n = siblings[(ci + 1) % siblings.length]; setBranchSelections(s => ({ ...s, [parentId]: n.id })); }}
                style={{ background: "transparent", border: "none", color: T.accent, fontSize: 18, cursor: "pointer", fontFamily: "'DM Mono', monospace", padding: "4px 8px" }}>›</button>
            </div>
          );
        })()}

        {isInThread && index > 0 && (
          <div style={{
            position: "absolute", left: 28, top: showInsertButton ? -4 : -8,
            width: 2, height: showInsertButton ? 12 : 16,
            background: `linear-gradient(to bottom, ${T.accentMuted}, ${T.accent})`, borderRadius: 1,
          }} />
        )}

        <div
          data-msg-bubble={msg.id}
          onClick={(e) => {
            if (isTarget) {
              e.stopPropagation();
              if (relocating) executeRelocate(msg.id);
              else if (linking) executeLink(msg.id);
              return;
            }
            if (!isEditing) {
              e.stopPropagation();
              setSelectedMsg(prev => prev === msg.id ? null : msg.id);
            }
          }}
          style={{
            position: "relative", padding: "12px 16px", margin: "2px 0", borderRadius: 16,
            background: isFlashing ? T.accentDim : isSource ? T.linkDim : isEditing ? T.surfaceHover : isActive ? T.surfaceHover : T.surface,
            border: `1px solid ${isFlashing ? T.accent : isSource ? T.link : isEditing ? T.accent : isActive ? T.borderLight : T.border}`,
            transition: "all 0.3s ease",
            cursor: isTarget ? "pointer" : "default",
            opacity: isSelectingTarget && isSource ? 0.5 : 1,
            outline: isTarget ? `2px solid ${relocating ? T.sage : T.link}` : "none",
            outlineOffset: -2,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {showReplyBadge && (
            <div onClick={(e) => { e.stopPropagation(); openThread(msg.id); }}
              style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
                padding: "5px 10px", borderRadius: 8, background: T.accentDim,
                cursor: "pointer", width: "fit-content", maxWidth: "100%",
              }}>
              <span style={{ fontSize: 11, color: T.accent, fontFamily: "'DM Mono', monospace" }}>↩</span>
              <span style={{
                fontSize: 13, color: T.accentMuted, fontFamily: "'Crimson Pro', serif", fontStyle: "italic",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{getPreview(msg.replyTo)}</span>
            </div>
          )}

          {isInThread && (
            <div style={{
              position: "absolute", left: -8, top: "50%", transform: "translateY(-50%)",
              width: 8, height: 8, borderRadius: "50%",
              background: index === 0 ? T.sage : index === arr.length - 1 ? T.accent : T.textMuted,
              border: `2px solid ${T.bg}`, zIndex: 2,
            }} />
          )}

          {isEditing ? (
            <div>
              <textarea value={editText} onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                  if (e.key === "Escape") { setEditingMsg(null); setEditText(""); }
                }}
                autoFocus
                style={{
                  width: "100%", minHeight: 60, padding: 10, background: T.bubble,
                  border: `1px solid ${T.accent}`, borderRadius: 8, color: T.text,
                  fontFamily: "'Crimson Pro', serif", fontSize: 16, lineHeight: 1.55,
                  resize: "vertical", outline: "none",
                }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={saveEdit}
                  style={{ padding: "6px 16px", borderRadius: 8, background: T.accent, color: T.bg, border: "none", fontSize: 13, fontFamily: "'DM Mono', monospace", cursor: "pointer", fontWeight: 600 }}>guardar</button>
                <button onClick={() => { setEditingMsg(null); setEditText(""); }}
                  style={{ padding: "6px 16px", borderRadius: 8, background: "transparent", color: T.textSecondary, border: `1px solid ${T.border}`, fontSize: 13, fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>cancelar</button>
              </div>
            </div>
          ) : (
            <>
              {msg.text && (
                <p style={{ margin: 0, fontFamily: "'Crimson Pro', serif", fontSize: 16, lineHeight: 1.55, color: T.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {msg.text}
                </p>
              )}
              {msgImages.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: msg.text ? 8 : 0 }}>
                  {msgImages.map((img, imgIdx) => (
                    <div key={img.id || imgIdx}
                      onClick={(e) => { e.stopPropagation(); setViewingImage(img); }}
                      style={{
                        borderRadius: 10, overflow: "hidden", cursor: "pointer",
                        border: `1px solid ${T.border}`,
                        maxWidth: msgImages.length === 1 ? "100%" : "calc(50% - 3px)",
                        flexGrow: msgImages.length === 1 ? 1 : 0,
                      }}>
                      {img.type === "application/pdf" ? (
                        <div style={{ padding: "12px 16px", background: T.bubble, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 24 }}>📄</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name}</span>
                        </div>
                      ) : (
                        <img src={img.data} alt={img.name}
                          style={{ display: "block", width: "100%", maxHeight: 300, objectFit: "cover" }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!isEditing && msgLinks.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
              {msgLinks.map(lnk => (
                <div key={lnk.id} style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                  borderRadius: 8, background: T.linkDim, cursor: "pointer", maxWidth: "100%",
                }}
                  onClick={(e) => { e.stopPropagation(); navigateToMessage(lnk.targetId); }}
                >
                  <span style={{ fontSize: 10, color: T.link, fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>⟶</span>
                  <span style={{
                    fontSize: 12, color: T.linkMuted, fontFamily: "'Crimson Pro', serif", fontStyle: "italic",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{getPreview(lnk.targetId)}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeLink(msg.id, lnk.id); }}
                    style={{
                      background: "transparent", border: "none", color: T.textMuted,
                      fontSize: 14, cursor: "pointer", padding: "0 4px", flexShrink: 0,
                      fontFamily: "'DM Mono', monospace",
                    }}>×</button>
                </div>
              ))}
            </div>
          )}

          {!isEditing && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.textMuted, letterSpacing: "0.5px" }}>
                {formatTime(msg.timestamp)}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {isInThread && getChildren(msg.id).length > 1 && (
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.accent, background: T.accentDim, padding: "2px 8px", borderRadius: 8 }}>
                    ⑂ {getChildren(msg.id).length}
                  </span>
                )}
                {!isInThread && replyCount > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); openThread(msg.id); }}
                    style={{ background: T.sageDim, border: "none", borderRadius: 10, padding: "3px 12px", fontSize: 11, fontFamily: "'DM Mono', monospace", color: T.sage, cursor: "pointer", letterSpacing: "0.3px" }}>
                    {replyCount} {replyCount === 1 ? "respuesta" : "respuestas"}
                  </button>
                )}
              </div>
            </div>
          )}

          {isActive && !isEditing && !isSelectingTarget && (
            <div data-msg-actions
              style={{
                position: "absolute", top: -16, right: 8, display: "flex", gap: 2,
                background: T.bubble, borderRadius: 12, padding: "4px 5px",
                border: `1px solid ${T.borderLight}`, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 10,
              }}>
              <ActionBtn icon="↩" label={isInThread ? "Rama" : "Responder"} onClick={(e) => { e.stopPropagation(); startReply(msg.id); }} />
              {msg.replyTo && !isInThread && (
                <ActionBtn icon="◎" label="Ver hilo" onClick={(e) => { e.stopPropagation(); openThread(msg.id); }} />
              )}
              <ActionBtn icon="⤻" label="Reubicar" color={T.sage} onClick={(e) => { e.stopPropagation(); startRelocate(msg.id); }} />
              <ActionBtn icon="⟶" label="Vincular" color={T.link} onClick={(e) => { e.stopPropagation(); startLink(msg.id); }} />
              <ActionBtn icon="✎" label="Editar" onClick={(e) => { e.stopPropagation(); startEdit(msg.id); }} />
              <ActionBtn icon="×" label="Borrar" danger onClick={(e) => { e.stopPropagation(); setDeleteConfirm(msg.id); }} />
            </div>
          )}

          {isDeleting && (
            <div onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
              style={{
                position: "absolute", [index === 0 ? "bottom" : "top"]: index === 0 ? -48 : -48, right: 8,
                background: T.bubble, borderRadius: 12,
                padding: "8px 14px", border: `1px solid ${T.danger}`, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                zIndex: 20, display: "flex", alignItems: "center", gap: 10,
              }}>
              <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: T.danger }}>¿borrar?</span>
              <button onClick={() => deleteMessage(msg.id)}
                style={{ padding: "5px 12px", borderRadius: 8, background: T.danger, color: "#fff", border: "none", fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer", fontWeight: 600 }}>sí</button>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ padding: "5px 12px", borderRadius: 8, background: "transparent", color: T.textSecondary, border: `1px solid ${T.border}`, fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>no</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      width: "100%", height: "100dvh", background: T.bg,
      display: "flex", flexDirection: "column", fontFamily: "'Crimson Pro', serif",
      overflow: "hidden",
      paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <div style={{
        padding: "14px 20px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isInThread && (
            <button onClick={closeThread}
              style={{ background: "transparent", border: "none", color: T.accent, fontSize: 20, cursor: "pointer", padding: "4px 8px", fontFamily: "'DM Mono', monospace" }}>←</button>
          )}
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: T.text, letterSpacing: "-0.3px" }}>hilo</h1>
          {isInThread && (
            <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: T.textMuted, background: T.accentDim, padding: "3px 10px", borderRadius: 6 }}>
              {visibleMessages.length} notas
            </span>
          )}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.textMuted, letterSpacing: "1px" }}>
          {messages.length} notas total
        </div>
      </div>

      {isSelectingTarget && (
        <div style={{
          padding: "10px 16px", background: relocating ? T.sageDim : T.linkDim,
          borderBottom: `1px solid ${relocating ? "rgba(122,158,126,0.3)" : "rgba(126,170,200,0.3)"}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: relocating ? T.sage : T.link, flexShrink: 0 }}>
              {relocating ? "⤻" : "⟶"}
            </span>
            <span style={{ fontSize: 13, fontFamily: "'Crimson Pro', serif", fontStyle: "italic", color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {getPreview(selectingSource)}
            </span>
            <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: T.textMuted, flexShrink: 0 }}>→ toca destino</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {relocating && (
              <button onClick={relocateToRoot}
                style={{ padding: "6px 14px", borderRadius: 8, background: T.sageDim, color: T.sage, border: "1px solid rgba(122,158,126,0.3)", fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>
                a raíz
              </button>
            )}
            <button onClick={clearModes}
              style={{ padding: "6px 14px", borderRadius: 8, background: "transparent", color: T.textMuted, border: `1px solid ${T.border}`, fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>
              cancelar
            </button>
          </div>
        </div>
      )}

      <div ref={listRef}
        style={{ flex: 1, overflowY: "auto", padding: "16px 12px 8px", display: "flex", flexDirection: "column", gap: 4, WebkitOverflowScrolling: "touch" }}>
        {visibleMessages.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.5 }}>
            <span style={{ fontSize: 48, lineHeight: 1, filter: "grayscale(0.5)" }}>🧵</span>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: T.textMuted, textAlign: "center", lineHeight: 1.6 }}>
              escribe tu primera nota<br />
              <span style={{ opacity: 0.6 }}>las ideas se conectan respondiendo a otras</span>
            </p>
          </div>
        ) : visibleMessages.map((msg, i, arr) => renderMessage(msg, i, arr))}
        <div ref={messagesEndRef} />
      </div>

      {!isSelectingTarget && (
        <div style={{ padding: "10px 12px 14px", borderTop: `1px solid ${T.border}`, flexShrink: 0, background: T.bg }}>
          {(replyingTo || insertBeforeId) && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8,
              padding: "6px 12px", borderRadius: 10,
              background: insertBeforeId ? T.sageDim : T.accentDim,
              border: `1px solid ${insertBeforeId ? "rgba(122,158,126,0.3)" : "rgba(200,149,108,0.3)"}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: insertBeforeId ? T.sage : T.accent, flexShrink: 0 }}>
                  {insertBeforeId ? "↑ antes de" : isInThread ? "⑂ rama" : "↩ respondiendo"}
                </span>
                <span style={{ fontSize: 12, fontFamily: "'Crimson Pro', serif", fontStyle: "italic", color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {getPreview(insertBeforeId || replyingTo)}
                </span>
              </div>
              <button onClick={clearModes}
                style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 16, padding: "2px 6px", flexShrink: 0 }}>×</button>
            </div>
          )}
          {pendingFiles.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {pendingFiles.map(f => (
                <div key={f.id} style={{
                  position: "relative", borderRadius: 10, overflow: "hidden",
                  border: `1px solid ${T.borderLight}`, background: T.surface,
                }}>
                  {f.type === "application/pdf" ? (
                    <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 18 }}>📄</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.textSecondary, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    </div>
                  ) : (
                    <img src={f.data} alt={f.name} style={{ display: "block", height: 56, width: "auto", maxWidth: 80, objectFit: "cover" }} />
                  )}
                  <button onClick={() => removePendingFile(f.id)}
                    style={{
                      position: "absolute", top: 2, right: 2, width: 20, height: 20,
                      borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none",
                      color: "#fff", fontSize: 12, cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace",
                    }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
              multiple onChange={handleFileSelect} style={{ display: "none" }} />
            <button onClick={() => fileInputRef.current?.click()}
              style={{
                width: 44, height: 44, borderRadius: "50%", border: `1px solid ${T.borderLight}`,
                background: T.surface, color: T.textSecondary, fontSize: 18,
                cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center",
                justifyContent: "center", WebkitTapHighlightColor: "transparent",
              }}>📎</button>
            <textarea ref={inputRef} value={inputText} onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="escribe una nota..." rows={1}
              style={{
                flex: 1, padding: "12px 16px", borderRadius: 24, border: `1px solid ${T.borderLight}`,
                background: T.surface, color: T.text, fontFamily: "'Crimson Pro', serif", fontSize: 16,
                lineHeight: 1.4, resize: "none", outline: "none", maxHeight: 120, minHeight: 44,
                WebkitAppearance: "none",
              }}
              onFocus={(e) => e.target.style.borderColor = T.accent}
              onBlur={(e) => e.target.style.borderColor = T.borderLight}
              onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            />
            <button onClick={handleSend} disabled={!inputText.trim() && pendingFiles.length === 0}
              style={{
                width: 44, height: 44, borderRadius: "50%", border: "none",
                background: (inputText.trim() || pendingFiles.length > 0) ? T.accent : T.surface,
                color: (inputText.trim() || pendingFiles.length > 0) ? T.bg : T.textMuted,
                fontSize: 18, cursor: (inputText.trim() || pendingFiles.length > 0) ? "pointer" : "default",
                transition: "all 0.15s", flexShrink: 0, display: "flex", alignItems: "center",
                justifyContent: "center", fontFamily: "'DM Mono', monospace",
                WebkitTapHighlightColor: "transparent",
              }}>↑</button>
          </div>
        </div>
      )}

      {viewingImage && (
        <div onClick={() => setViewingImage(null)}
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.92)", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <button onClick={() => setViewingImage(null)}
            style={{
              position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)",
              border: "none", color: "#fff", width: 44, height: 44, borderRadius: "50%",
              fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "'DM Mono', monospace", zIndex: 101,
            }}>×</button>
          {viewingImage.type === "application/pdf" ? (
            <div style={{ textAlign: "center", color: T.text }}>
              <span style={{ fontSize: 64, display: "block", marginBottom: 16 }}>📄</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14 }}>{viewingImage.name}</span>
              <br />
              <a href={viewingImage.data} download={viewingImage.name}
                onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
                style={{
                  display: "inline-block", marginTop: 12, padding: "10px 24px",
                  borderRadius: 10, background: T.accent, color: T.bg,
                  fontFamily: "'DM Mono', monospace", fontSize: 13, textDecoration: "none", fontWeight: 600,
                }}>descargar</a>
            </div>
          ) : (
            <img src={viewingImage.data} alt={viewingImage.name}
              onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
              style={{ maxWidth: "92%", maxHeight: "90%", objectFit: "contain", borderRadius: 8 }} />
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ icon, label, onClick, danger, color }) {
  return (
    <button onClick={onClick} title={label}
      style={{
        background: "transparent", border: "none", borderRadius: 8,
        width: 34, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", fontSize: icon === "×" ? 18 : 14,
        color: color || (danger ? T.danger : T.textSecondary),
        fontFamily: "'DM Mono', monospace",
        WebkitTapHighlightColor: "transparent",
      }}>{icon}</button>
  );
}
