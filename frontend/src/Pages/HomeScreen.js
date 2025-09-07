import React, { useState, useCallback, useEffect } from 'react';
import Upload from '../components/Upload';
import Chat from '../components/chat';
import '../css/HomeScreen.css';

const API = 'http://localhost:5000';

const HomeScreen = () => {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [conversationTitles, setConversationTitles] = useState({});
  
  // ✅ INITIALIZE attachedFiles FROM localStorage
  const [attachedFiles, setAttachedFiles] = useState(() => {
    const activeConvId = localStorage.getItem('activeConversationId');
    if (activeConvId) {
      const saved = localStorage.getItem(`attachedFiles_${activeConvId}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse saved attached files');
        }
      }
    }
    return [];
  });

  const [allUploadedFiles, setAllUploadedFiles] = useState([]);
  const [showMySpace, setShowMySpace] = useState(false);

  // Load initial data
  useEffect(() => {
    const sessionKey = localStorage.getItem('sessionKey');
    if (!sessionKey) return;

    (async () => {
      try {
        // Load conversations
        const convRes = await fetch(`${API}/conversations/${sessionKey}`, { credentials: 'include' });
        const convData = await convRes.json();
        const convs = (convData.conversations || []).map(c => ({
          id: c.conversationId,
          title: c.title,
          active: !!c.isActive,
          timestamp: c.updatedAt || c.createdAt
        }));
        setConversations(convs);
        
        // Build titles mapping
        const titlesMap = {};
        convs.forEach(conv => {
          titlesMap[conv.id] = conv.title;
        });
        setConversationTitles(titlesMap);

        const active = convs.find(c => c.active) || convs[0];

        // Load messages for active conversation
        if (active) {
          setActiveConversationId(active.id);
          localStorage.setItem('activeConversationId', active.id);
          
          const msgRes = await fetch(`${API}/conversations/${active.id}/messages`, { credentials: 'include' });
          const msgData = await msgRes. json();
          
          const normalized = (msgData.messages || []).map(m => ({
            id: m.messageId,
            text: m.text,
            sender: m.role === 'ai' ? 'ai' : m.role === 'user' ? 'user' : 'system',
            timestamp: m.createdAt,
            attachedFiles: (m.attachments || []).map(f => ({ 
              id: f.uploadId, 
              name: f.originalName,
              type: f.type || 'application/octet-stream'
            }))
          }));
          setMessages(normalized);

          // ✅ RELOAD attachedFiles if conversation changed
          const savedAttachedFiles = localStorage.getItem(`attachedFiles_${active.id}`);
          if (savedAttachedFiles) {
            try {
              setAttachedFiles(JSON.parse(savedAttachedFiles));
            } catch (e) {
              console.error('Failed to parse saved attached files');
              setAttachedFiles([]);
            }
          } else {
            setAttachedFiles([]);
          }
        }

        // Load all uploaded files (MySpace)
        const upRes = await fetch(`${API}/uploads/${sessionKey}`, { credentials: 'include' });
        const upData = await upRes.json();
        const files = (upData.uploads || []).map(u => ({
          id: u.uploadId,
          name: u.originalName,
          size: u.size,
          type: u.mimeType,
          uploadedAt: u.uploadedAt,
          s3Url: u.s3Url,
          publicUrl: u.presignedUrl
        }));
        setAllUploadedFiles(files);

      } catch (error) {
        console.error('Failed to load data:', error);
      }
    })();
  }, []);

  // ✅ SAVE attached files to localStorage whenever they change
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem(`attachedFiles_${activeConversationId}`, JSON.stringify(attachedFiles));
    }
  }, [attachedFiles, activeConversationId]);

  // Handle upload completion
  const handleUploadComplete = useCallback(async (file) => {
    const sessionKey = localStorage.getItem('sessionKey');
    if (!sessionKey) return;

    try {
      // Refresh all uploaded files list
      const upRes = await fetch(`${API}/uploads/${sessionKey}`, { credentials: 'include' });
      const upData = await upRes.json();
      const files = (upData.uploads || []).map(u => ({
        id: u.uploadId,
        name: u.originalName,
        size: u.size,
        type: u.mimeType,
        uploadedAt: u.uploadedAt,
        s3Url: u.s3Url,
        publicUrl: u.presignedUrl
      }));
      setAllUploadedFiles(files);

      // ✅ AUTO-ATTACH newly uploaded file to current chat
      const newFile = files.find(f => f.name === file.originalName);
      if (newFile) {
        handleFileAttach(newFile);
      }
    } catch (error) {
      console.error('Failed to refresh uploads:', error);
    }
  }, []);

  // Handle file attachment to chat (from upload or MySpace)
  const handleFileAttach = useCallback((file) => {
    setAttachedFiles(prev => {
      // Don't add duplicates
      if (prev.find(f => f.id === file.id)) return prev;
      return [...prev, file];
    });
  }, []);

  // Handle file removal from chat - ONLY removes from attached, not from MySpace
  const handleFileRemove = useCallback((fileId) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  // Add file from MySpace to chat
  const addFileFromMySpace = useCallback((file) => {
    handleFileAttach(file);
    setShowMySpace(false);
  }, [handleFileAttach]);

  // Update conversation title dynamically
  const updateConversationTitle = useCallback(async (conversationId, newTitle) => {
    const sessionKey = localStorage.getItem('sessionKey');
    if (!sessionKey) return;

    try {
      const shortTitle = newTitle.length > 40 ? newTitle.substring(0, 40) + '...' : newTitle;
      
      await fetch(`${API}/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionKey, title: shortTitle })
      });

      setConversationTitles(prev => ({
        ...prev,
        [conversationId]: shortTitle
      }));

      setConversations(prev => prev.map(conv => 
        conv.id === conversationId 
          ? { ...conv, title: shortTitle }
          : conv
      ));
    } catch (error) {
      console.error('Failed to update conversation title:', error);
    }
  }, []);

  // Handle new message - KEEP attached files after sending
  const handleNewMessage = useCallback(async (messageText) => {
    if (!messageText.trim() || !activeConversationId) return;
    const sessionKey = localStorage.getItem('sessionKey');
    if (!sessionKey) return;

    const attachedFileIds = attachedFiles.map(f => f.id);
    const draftAttached = attachedFiles.map(f => ({ id: f.id, name: f.name, type: f.type }));

    // Set conversation title from first message if it's still "New Chat"
    const currentTitle = conversationTitles[activeConversationId] || 'New Chat';
    if (currentTitle === 'New Chat' && messageText.trim()) {
      await updateConversationTitle(activeConversationId, messageText.trim());
    }

    // Optimistic user message
    setMessages(prev => [
      ...prev,
      {
        id: Date.now(),
        text: messageText.trim(),
        sender: 'user',
        timestamp: new Date(),
        attachedFiles: draftAttached
      }
    ]);

    try {
      const res = await fetch(`${API}/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionKey,
          conversationId: activeConversationId,
          text: messageText.trim(),
          attachedUploadIds: attachedFileIds
        })
      });
      
      const data = await res.json();
      if (data && data.response) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            text: data.response,
            sender: 'ai',
            timestamp: new Date()
          }
        ]);
      }
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 2,
          text: 'Sorry, there was an error processing the request.',
          sender: 'ai',
          timestamp: new Date()
        }
      ]);
    }

    // ✅ KEEP attached files - don't clear them after sending
  }, [attachedFiles, activeConversationId, conversationTitles, updateConversationTitle]);

  // Create new conversation
  const handleNewChat = useCallback(async () => {
    const sessionKey = localStorage.getItem('sessionKey');
    if (!sessionKey) return;
    
    try {
      const res = await fetch(`${API}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionKey, title: 'New Chat' })
      });
      
      const data = await res.json();
      if (data && data.conversation) {
        const c = data.conversation;
        const newConv = { 
          id: c.conversationId, 
          title: c.title, 
          active: true, 
          timestamp: c.updatedAt 
        };

        setConversations(prev => [
          newConv,
          ...prev.map(x => ({ ...x, active: false }))
        ]);

        setConversationTitles(prev => ({
          ...prev,
          [c.conversationId]: c.title
        }));

        setActiveConversationId(c.conversationId);
        localStorage.setItem('activeConversationId', c.conversationId);
        setMessages([]);
        
        // ✅ Start fresh for new conversation
        setAttachedFiles([]);
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  }, []);

  // Select conversation
  const handleConversationSelect = useCallback(async (id) => {
    const sessionKey = localStorage.getItem('sessionKey');
    if (!sessionKey) return;
    
    try {
      await fetch(`${API}/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionKey, setActive: true })
      });

      setConversations(prev => prev.map(c => ({ ...c, active: c.id === id })));
      setActiveConversationId(id);
      localStorage.setItem('activeConversationId', id);

      const msgRes = await fetch(`${API}/conversations/${id}/messages`, { credentials: 'include' });
      const msgData = await msgRes.json();
      const normalized = (msgData.messages || []).map(m => ({
        id: m.messageId,
        text: m.text,
        sender: m.role === 'ai' ? 'ai' : m.role === 'user' ? 'user' : 'system',
        timestamp: m.createdAt,
        attachedFiles: (m.attachments || []).map(f => ({ 
          id: f.uploadId, 
          name: f.originalName,
          type: f.type || 'application/octet-stream'
        }))
      }));
      setMessages(normalized);

      // ✅ Load attached files for this conversation
      const savedAttachedFiles = localStorage.getItem(`attachedFiles_${id}`);
      if (savedAttachedFiles) {
        try {
          setAttachedFiles(JSON.parse(savedAttachedFiles));
        } catch (e) {
          console.error('Failed to parse saved attached files');
          setAttachedFiles([]);
        }
      } else {
        setAttachedFiles([]);
      }
    } catch (error) {
      console.error('Failed to switch conversation:', error);
    }
  }, []);

  // Helper functions
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const units = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
  };

  // Files that are not currently attached
  const availableFiles = allUploadedFiles.filter(f => !attachedFiles.find(af => af.id === f.id));

  return (
    <div className="home-screen">
      {/* Full-width sticky header across left+right */}
    <header className="app-header">
      <div className="app-header-left">
        <span className="app-logo">✨</span>
        <h1 className="app-title">AI Workspace</h1>
      </div>
    </header>
      <aside className="conversation-sidebar">
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            <span>New Chat</span>
          </button>
        </div>

        {/* MySpace Section */}
        {availableFiles.length > 0 && (
          <div className="myspace-section">
            <div className="myspace-header" onClick={() => setShowMySpace(!showMySpace)}>
              <div className="myspace-title">
                <span className="myspace-icon">📁</span>
                <span>MySpace ({availableFiles.length})</span>
              </div>
              <div className={`myspace-toggle ${showMySpace ? 'open' : ''}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                </svg>
              </div>
            </div>
            
            {showMySpace && (
              <div className="myspace-files">
                {availableFiles.map(file => (
                  <div
                    key={file.id}
                    className="myspace-file-item"
                    onClick={() => addFileFromMySpace(file)}
                  >
                    <div className="file-icon">
                      {file.type?.startsWith('image/') ? '🖼️' : 
                       file.type?.startsWith('audio/') ? '🎵' : 
                       file.type?.startsWith('video/') ? '🎬' : '📄'}
                    </div>
                    <div className="file-details">
                      <div className="file-name">{file.name}</div>
                      <div className="file-meta">
                        {formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="file-add-icon">+</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Conversation History */}
        <div className="conversation-list">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`conversation-item ${conv.active ? 'active' : ''}`}
              onClick={() => handleConversationSelect(conv.id)}
            >
              <div className="conversation-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
              </div>
              <div className="conversation-details">
                <div className="conversation-title">
                  {conversationTitles[conv.id] || conv.title || 'New Chat'}
                </div>
                <div className="conversation-time">
                  {new Date(conv.timestamp).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="main-content">
        <section className="upload-section">
          <Upload
            onUploadComplete={handleUploadComplete}
            onFileAttach={handleFileAttach}
          />
        </section>

        <section className="chat-section">
          <Chat
            messages={messages}
            onNewMessage={handleNewMessage}
            attachedFiles={attachedFiles}
            onFileRemove={handleFileRemove}
            allFiles={allUploadedFiles}
            onFileAttach={handleFileAttach}
          />
        </section>
      </main>
    </div>
  );
};

export default HomeScreen;
